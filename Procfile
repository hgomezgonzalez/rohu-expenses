web: cd backend && gunicorn "app.main:app" --bind 0.0.0.0:$PORT --workers 2 --worker-class uvicorn.workers.UvicornWorker --timeout 120
release: cd backend && python3 -m seeds.seed_db
