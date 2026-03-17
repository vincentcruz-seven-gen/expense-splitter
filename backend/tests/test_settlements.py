import pytest
from services.settlement_engine import calculate_settlements, calculate_net_balances


def _make_expense(paid_by_key, amount, splits):
    """Helper: build an expense doc using the new payers[] + participant_key format."""
    return {
        "payers": [{"participant_key": paid_by_key, "amount": amount}],
        "splits": [{"participant_key": k, "share": s} for k, s in splits.items()],
    }


def test_simple_two_person():
    net = {"Alice": 25.0, "Bob": -25.0}
    result = calculate_settlements(net)
    assert len(result) == 1
    assert result[0]["from"] == "Bob"
    assert result[0]["to"] == "Alice"
    assert result[0]["amount"] == 25.0


def test_three_person_one_payer():
    """Alice paid ₱90 for all three equally. Bob and Carol each owe ₱30."""
    net = {"Alice": 60.0, "Bob": -30.0, "Carol": -30.0}
    result = calculate_settlements(net)
    assert len(result) == 2
    assert all(t["to"] == "Alice" for t in result)
    assert abs(sum(t["amount"] for t in result) - 60.0) < 0.01


def test_chain_simplification():
    """A owes B ₱10, B owes C ₱10 → simplifies to A owes C ₱10 directly."""
    net = {"A": -10.0, "B": 0.0, "C": 10.0}
    result = calculate_settlements(net)
    assert len(result) == 1
    assert result[0]["from"] == "A"
    assert result[0]["to"] == "C"
    assert result[0]["amount"] == 10.0


def test_circular_debt_zero():
    net = {"A": 0.0, "B": 0.0, "C": 0.0}
    assert calculate_settlements(net) == []


def test_empty():
    assert calculate_settlements({}) == []


def test_partial_settlement():
    net = {"A": -5.0, "B": 5.0}
    result = calculate_settlements(net)
    assert len(result) == 1
    assert result[0]["amount"] == 5.0


def test_net_balances_with_payers_array():
    """Alice paid ₱90 for all three via new payers[] format."""
    expenses = [
        _make_expense("uid:Alice", 90.0, {"uid:Alice": 30.0, "uid:Bob": 30.0, "uid:Carol": 30.0})
    ]
    participants = [
        {"participant_key": "uid:Alice", "display_name": "Alice"},
        {"participant_key": "uid:Bob",   "display_name": "Bob"},
        {"participant_key": "uid:Carol", "display_name": "Carol"},
    ]
    net = calculate_net_balances(expenses, participants)
    assert abs(net["uid:Alice"] - 60.0) < 0.01
    assert abs(net["uid:Bob"]   - (-30.0)) < 0.01
    assert abs(net["uid:Carol"] - (-30.0)) < 0.01


def test_guest_participant():
    """Guest 'Lola' owes Alice for dinner."""
    expenses = [
        _make_expense("uid:Alice", 100.0, {"uid:Alice": 50.0, "gid:Lola": 50.0})
    ]
    participants = [
        {"participant_key": "uid:Alice", "display_name": "Alice"},
        {"participant_key": "gid:Lola",  "display_name": "Lola"},
    ]
    net = calculate_net_balances(expenses, participants)
    debts = calculate_settlements(net)
    assert len(debts) == 1
    assert debts[0]["from"] == "gid:Lola"
    assert debts[0]["to"] == "uid:Alice"
    assert debts[0]["amount"] == 50.0


def test_multi_payer():
    """Alice paid ₱1000, Bob paid ₱500. Split equally among 3 (₱500 each)."""
    expenses = [
        {
            "payers": [
                {"participant_key": "uid:Alice", "amount": 1000.0},
                {"participant_key": "uid:Bob",   "amount": 500.0},
            ],
            "splits": [
                {"participant_key": "uid:Alice", "share": 500.0},
                {"participant_key": "uid:Bob",   "share": 500.0},
                {"participant_key": "uid:Carol", "share": 500.0},
            ],
        }
    ]
    participants = [
        {"participant_key": "uid:Alice", "display_name": "Alice"},
        {"participant_key": "uid:Bob",   "display_name": "Bob"},
        {"participant_key": "uid:Carol", "display_name": "Carol"},
    ]
    net = calculate_net_balances(expenses, participants)
    # Alice: +1000 - 500 = +500
    # Bob:   +500  - 500 =   0
    # Carol:    0  - 500 = -500
    assert abs(net["uid:Alice"] - 500.0) < 0.01
    assert abs(net["uid:Bob"]   - 0.0) < 0.01
    assert abs(net["uid:Carol"] - (-500.0)) < 0.01
    debts = calculate_settlements(net)
    assert len(debts) == 1
    assert debts[0]["from"] == "uid:Carol"
    assert debts[0]["to"] == "uid:Alice"


def test_complex_multi_payer():
    net = {"Alice": 40.0, "Bob": -5.0, "Carol": -35.0}
    result = calculate_settlements(net)
    total_paid = sum(t["amount"] for t in result)
    assert abs(total_paid - 40.0) < 0.01
    assert len(result) <= 2
