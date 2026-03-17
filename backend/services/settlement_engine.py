def calculate_net_balances(expenses: list, participants: list[dict]) -> dict[str, float]:
    """
    Returns {participant_key: net_balance}.
    Positive = owed money (creditor). Negative = owes money (debtor).

    participants: [{participant_key, display_name}]
    expenses: each expense must have either:
      - payers: [{participant_key, amount}]   (new multi-payer format)
      - paid_by: ObjectId  (legacy single-payer, converted at read time)
    splits must have participant_key field.
    """
    balances = {p["participant_key"]: 0.0 for p in participants}

    for exp in expenses:
        # Handle multi-payer (new format)
        for payer in exp.get("payers", []):
            key = payer["participant_key"]
            if key in balances:
                balances[key] = round(balances[key] + payer["amount"], 4)

        # Each participant owes their share
        for split in exp.get("splits", []):
            key = split.get("participant_key")
            if key and key in balances:
                balances[key] = round(balances[key] - split["share"], 4)

    return balances


def calculate_settlements(net_balances: dict[str, float]) -> list[dict]:
    """
    Min-cash-flow greedy algorithm.
    Reduces arbitrary debts to the minimum number of transactions.
    Returns: [{from: participant_key, to: participant_key, amount: float}]
    """
    balances = {k: round(v, 2) for k, v in net_balances.items() if abs(v) > 0.005}
    transactions = []

    while len(balances) >= 2:
        creditor = max(balances, key=balances.get)
        debtor = min(balances, key=balances.get)

        if balances[creditor] <= 0.005 or balances[debtor] >= -0.005:
            break

        amount = min(balances[creditor], -balances[debtor])
        amount = round(amount, 2)

        transactions.append({"from": debtor, "to": creditor, "amount": amount})

        balances[creditor] = round(balances[creditor] - amount, 2)
        balances[debtor] = round(balances[debtor] + amount, 2)
        balances = {k: v for k, v in balances.items() if abs(v) > 0.005}

    return transactions
