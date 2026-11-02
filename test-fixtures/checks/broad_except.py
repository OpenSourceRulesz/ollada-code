def get(user):
    try:
        return user.name
    except Exception:
        return "unknown"
