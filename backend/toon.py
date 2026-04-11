def to_toon(data, indent=0):
    """
    Converts a Python dictionary, list, or primitive into Token-Oriented Object Notation (TOON).
    This strips out all JSON syntactic noise like braces, quotes, and commas to save LLM context window tokens.
    """
    lines = []
    prefix = "  " * indent
    
    if isinstance(data, dict):
        for k, v in data.items():
            # Skip empty lists or None values to save even more tokens
            if v is None or (isinstance(v, list) and not v):
                continue
                
            if isinstance(v, (dict, list)):
                lines.append(f"{prefix}{k}:")
                lines.append(to_toon(v, indent + 1))
            else:
                lines.append(f"{prefix}{k}: {v}")
                
    elif isinstance(data, list):
        for item in data:
            if isinstance(item, (dict, list)):
                lines.append(f"{prefix}-")
                lines.append(to_toon(item, indent + 1))
            else:
                lines.append(f"{prefix}- {item}")
                
    else:
        return f"{prefix}{data}"
        
    return "\n".join(lines)
