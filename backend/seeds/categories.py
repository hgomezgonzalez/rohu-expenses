"""Seed default categories for ROHU PayControl."""

CATEGORIES = [
    {"name": "Servicios Públicos", "slug": "servicios-publicos", "icon": "zap", "color": "#f59e0b", "sort_order": 1},
    {"name": "Vivienda", "slug": "vivienda", "icon": "home", "color": "#3b82f6", "sort_order": 2},
    {"name": "Comunicaciones", "slug": "comunicaciones", "icon": "wifi", "color": "#8b5cf6", "sort_order": 3},
    {"name": "Transporte", "slug": "transporte", "icon": "car", "color": "#10b981", "sort_order": 4},
    {"name": "Alimentación", "slug": "alimentacion", "icon": "shopping-cart", "color": "#ef4444", "sort_order": 5},
    {"name": "Salud", "slug": "salud", "icon": "heart", "color": "#ec4899", "sort_order": 6},
    {"name": "Entretenimiento", "slug": "entretenimiento", "icon": "film", "color": "#6366f1", "sort_order": 7},
    {"name": "Seguros", "slug": "seguros", "icon": "shield", "color": "#14b8a6", "sort_order": 8},
    {"name": "Educación", "slug": "educacion", "icon": "book", "color": "#f97316", "sort_order": 9},
    {"name": "Otros", "slug": "otros", "icon": "more-horizontal", "color": "#6b7280", "sort_order": 10},
]

SAMPLE_BILL_TEMPLATES = [
    {"name": "Electricidad", "category_slug": "servicios-publicos", "estimated_amount": 150000, "due_day": 15, "provider": "Enel-Codensa"},
    {"name": "Agua", "category_slug": "servicios-publicos", "estimated_amount": 80000, "due_day": 10, "provider": "Acueducto"},
    {"name": "Gas Natural", "category_slug": "servicios-publicos", "estimated_amount": 45000, "due_day": 20, "provider": "Vanti"},
    {"name": "Administración", "category_slug": "vivienda", "estimated_amount": 350000, "due_day": 5, "provider": "Conjunto Residencial"},
    {"name": "Internet", "category_slug": "comunicaciones", "estimated_amount": 89000, "due_day": 25, "provider": "Claro"},
    {"name": "Teléfono Celular", "category_slug": "comunicaciones", "estimated_amount": 55000, "due_day": 28, "provider": "Movistar"},
    {"name": "Netflix", "category_slug": "entretenimiento", "estimated_amount": 33000, "due_day": 1, "provider": "Netflix"},
    {"name": "Spotify", "category_slug": "entretenimiento", "estimated_amount": 17000, "due_day": 1, "provider": "Spotify"},
]

# Personal data for hfgomezgo
PERSONAL_BILL_TEMPLATES = [
    {"name": "Gas Natural 21 C/M Reserva V", "category_slug": "servicios-publicos", "estimated_amount": 25000, "due_day": 20, "provider": "Vanti", "notes": "Ref: 63842147"},
    {"name": "Cuota Apto BBVA 65/84 C/M", "category_slug": "vivienda", "estimated_amount": 760000, "due_day": 1, "provider": "BBVA", "notes": "Ref: 204119034571"},
    {"name": "Cuota hijos", "category_slug": "otros", "estimated_amount": 1750905, "due_day": 1},
    {"name": "Almuerzo afuera", "category_slug": "alimentacion", "estimated_amount": 500000, "due_day": 1},
    {"name": "Gasolina Moto", "category_slug": "transporte", "estimated_amount": 30000, "due_day": 15},
    {"name": "Admón Apto Mirador Cerezos 3", "category_slug": "vivienda", "estimated_amount": 203000, "due_day": 5, "notes": "Ref: 075063313 Ref1. 8 Ref2 603"},
    {"name": "Disney Plus y Star", "category_slug": "entretenimiento", "estimated_amount": 38900, "due_day": 1, "provider": "Disney"},
    {"name": "Admón Apto Reserva V", "category_slug": "vivienda", "estimated_amount": 445220, "due_day": 5},
    {"name": "Cuota BBVA Apto Reserva V 36/58", "category_slug": "vivienda", "estimated_amount": 2318300, "due_day": 1, "provider": "BBVA"},
    {"name": "EAAB Agua Reserva V", "category_slug": "servicios-publicos", "estimated_amount": 187000, "due_day": 10, "provider": "EAAB", "notes": "Cta: 11628115815 Contrato: 12666306"},
    {"name": "Netflix", "category_slug": "entretenimiento", "estimated_amount": 26900, "due_day": 1, "provider": "Netflix"},
    {"name": "Energía Codensa Reserva V", "category_slug": "servicios-publicos", "estimated_amount": 90000, "due_day": 15, "provider": "Enel-Codensa", "notes": "Ref: 78841262"},
    {"name": "Gasolina Carro", "category_slug": "transporte", "estimated_amount": 115000, "due_day": 15},
    {"name": "Cuota Multivacaciones Decameron", "category_slug": "entretenimiento", "estimated_amount": 215821, "due_day": 1, "provider": "Decameron"},
    {"name": "Medisanitas", "category_slug": "salud", "estimated_amount": 241605, "due_day": 1, "provider": "Medisanitas"},
    {"name": "ChatGPT", "category_slug": "comunicaciones", "estimated_amount": 100000, "due_day": 1, "provider": "OpenAI"},
    {"name": "Claude Code", "category_slug": "comunicaciones", "estimated_amount": 342000, "due_day": 1, "provider": "Anthropic"},
    {"name": "Cuota Carro Suzuki", "category_slug": "transporte", "estimated_amount": 1189675, "due_day": 1, "provider": "Suzuki"},
    {"name": "Internet ETB 12 C/M Reserva V", "category_slug": "comunicaciones", "estimated_amount": 97117, "due_day": 25, "provider": "ETB", "notes": "Ref: 12054796086"},
]

PERSONAL_INCOME_SOURCES = [
    {"name": "Renta Apto Mirador Cerezos 3", "amount": 1200000, "day_of_month": 1},
    {"name": "Póliza Carro de José (reembolso)", "amount": 123467, "day_of_month": 15},
]
