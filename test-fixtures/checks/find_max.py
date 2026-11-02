def find_max(xs):
    max_val = None
    for x in xs:
        if x > max_val:
            max_val = x
    return max_val
