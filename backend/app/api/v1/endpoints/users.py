import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import hash_password, verify_password
from app.api.v1.deps import get_current_user, get_current_admin
from app.models.user import User
from app.models.bill_template import BillTemplate
from app.schemas.user import (
    UserResponse, UserProfileUpdate, PasswordChange,
    AdminUserCreate, AdminUserUpdate, UserListItem,
)

router = APIRouter(prefix="/users", tags=["users"])


# ─── Self-service (any authenticated user) ───

@router.patch("/me", response_model=UserResponse)
async def update_my_profile(
    data: UserProfileUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    updates = data.model_dump(exclude_unset=True)

    if "email" in updates and updates["email"] != user.email:
        existing = await db.execute(select(User).where(User.email == updates["email"]))
        if existing.scalars().first():
            raise HTTPException(status_code=409, detail="Email already in use")

    for key, value in updates.items():
        setattr(user, key, value)
    await db.flush()
    await db.refresh(user)
    return user


@router.post("/me/change-password", status_code=status.HTTP_200_OK)
async def change_my_password(
    data: PasswordChange,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(data.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    user.hashed_password = hash_password(data.new_password)
    await db.flush()
    return {"message": "Password updated successfully"}


# ─── Admin operations ───

@router.get("", response_model=list[UserListItem])
async def list_users(
    search: str | None = Query(None),
    is_active: bool | None = Query(None),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    # Subquery for bill count
    bill_count_sq = (
        select(func.count(BillTemplate.id))
        .where(BillTemplate.user_id == User.id)
        .correlate(User)
        .scalar_subquery()
        .label("bill_count")
    )

    query = select(User, bill_count_sq)

    if search:
        query = query.where(
            User.full_name.ilike(f"%{search}%") | User.email.ilike(f"%{search}%")
        )
    if is_active is not None:
        query = query.where(User.is_active == is_active)

    query = query.order_by(User.created_at.desc())
    result = await db.execute(query)

    return [
        UserListItem(
            id=row.User.id,
            email=row.User.email,
            full_name=row.User.full_name,
            whatsapp=row.User.whatsapp,
            role=row.User.role,
            is_active=row.User.is_active,
            last_login=row.User.last_login,
            created_at=row.User.created_at,
            bill_count=row.bill_count or 0,
        )
        for row in result.all()
    ]


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def admin_create_user(
    data: AdminUserCreate,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalars().first():
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        whatsapp=data.whatsapp,
        timezone=data.timezone,
        role="user",  # Always create as regular user, admin can promote later
        is_active=True,  # Admin-created users are active immediately
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserResponse)
async def admin_update_user(
    user_id: uuid.UUID,
    data: AdminUserUpdate,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent admin from deactivating themselves
    if user.id == admin.id and data.is_active is False:
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(user, key, value)
    await db.flush()
    await db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_user(
    user_id: uuid.UUID,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    import os
    from sqlalchemy.orm import joinedload
    from app.models.payment import Payment
    from app.models.attachment import Attachment

    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Delete evidence files from disk before CASCADE
    att_result = await db.execute(
        select(Attachment)
        .join(Payment, Attachment.payment_id == Payment.id)
        .where(Payment.user_id == user_id)
    )
    for att in att_result.scalars().all():
        if os.path.exists(att.file_path):
            os.remove(att.file_path)

    # Use raw SQL DELETE to trigger PostgreSQL CASCADE (SQLAlchemy ORM tries to nullify FKs)
    from sqlalchemy import text
    await db.execute(text("DELETE FROM users WHERE id = :uid"), {"uid": str(user_id)})
    await db.flush()
