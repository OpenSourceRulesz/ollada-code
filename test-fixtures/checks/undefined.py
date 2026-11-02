def validate(user):
    return re.match(r"a", user.name) and User.query.get(user.id)
