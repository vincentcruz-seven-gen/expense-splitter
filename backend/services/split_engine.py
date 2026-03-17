from dataclasses import dataclass, field


@dataclass
class SplitResult:
    participant_key: str   # "uid:<ObjectId>" or "gid:<ObjectId>"
    display_name: str
    share: float           # final amount owed (subtotal + tax + tip - discount)
    subtotal_share: float = 0.0
    tax_share: float = 0.0
    tip_share: float = 0.0
    discount: float = 0.0
    percentage: float = 0.0
    items: list = field(default_factory=list)


def _distribute_pennies(amounts: list[float], total: float) -> list[float]:
    """Ensure amounts sum exactly to total via penny distribution."""
    rounded = [round(a, 2) for a in amounts]
    diff_cents = round((total - sum(rounded)) * 100)
    for i in range(abs(int(diff_cents))):
        idx = i % len(rounded)
        rounded[idx] = round(rounded[idx] + (0.01 if diff_cents > 0 else -0.01), 2)
    return rounded


def split_equal(subtotal: float, participants: list[dict]) -> list[SplitResult]:
    """participants: [{participant_key, display_name, discount?}]"""
    n = len(participants)
    if n == 0:
        raise ValueError("No participants")
    shares = _distribute_pennies([subtotal / n] * n, subtotal)
    pct = round(100.0 / n, 4)
    return [
        SplitResult(
            participant_key=p["participant_key"],
            display_name=p["display_name"],
            subtotal_share=shares[i],
            share=shares[i],
            percentage=pct,
        )
        for i, p in enumerate(participants)
    ]


def split_percentage(subtotal: float, allocations: list[dict]) -> list[SplitResult]:
    """allocations: [{participant_key, display_name, percentage, discount?}]"""
    total_pct = sum(a["percentage"] for a in allocations)
    if abs(total_pct - 100.0) > 0.01:
        raise ValueError(f"Percentages must sum to 100, got {total_pct:.2f}")
    raw = [subtotal * a["percentage"] / 100 for a in allocations]
    shares = _distribute_pennies(raw, subtotal)
    return [
        SplitResult(
            participant_key=a["participant_key"],
            display_name=a["display_name"],
            subtotal_share=shares[i],
            share=shares[i],
            percentage=a["percentage"],
        )
        for i, a in enumerate(allocations)
    ]


def split_itemized(items: list[dict]) -> list[SplitResult]:
    """items: [{name, price, consumer_keys: [{participant_key, display_name}]}]"""
    user_shares: dict[str, float] = {}
    user_names: dict[str, str] = {}
    user_items: dict[str, list[str]] = {}

    for item in items:
        consumers = item["consumer_keys"]
        if not consumers:
            continue
        per_person = item["price"] / len(consumers)
        for c in consumers:
            pk = c["participant_key"]
            user_shares[pk] = round(user_shares.get(pk, 0.0) + per_person, 4)
            user_names[pk] = c["display_name"]
            user_items.setdefault(pk, []).append(item["name"])

    total = round(sum(user_shares.values()), 2)
    shares = _distribute_pennies(list(user_shares.values()), total)
    return [
        SplitResult(
            participant_key=pk,
            display_name=user_names[pk],
            subtotal_share=shares[i],
            share=shares[i],
            percentage=round(shares[i] / total * 100, 4) if total > 0 else 0,
            items=user_items.get(pk, []),
        )
        for i, pk in enumerate(user_shares.keys())
    ]


def apply_discounts(results: list[SplitResult], discounts: dict[str, float]) -> list[SplitResult]:
    """Apply per-participant discounts. Reduces their individual share."""
    for r in results:
        disc = discounts.get(r.participant_key, 0.0)
        r.discount = disc
        r.subtotal_share = max(round(r.subtotal_share - disc, 2), 0.0)
        r.share = r.subtotal_share
    return results


def apply_tax_tip(
    results: list[SplitResult],
    tax_rate: float,
    tip_rate: float,
    round_to_peso: bool = False,
) -> list[SplitResult]:
    """Distribute tax and tip proportionally based on each person's subtotal share."""
    effective_subtotals = [r.subtotal_share for r in results]
    total_subtotal = sum(effective_subtotals)

    if total_subtotal <= 0:
        return results

    total_tax = round(total_subtotal * tax_rate, 2)
    total_tip = round(total_subtotal * tip_rate, 2)

    raw_tax = [total_subtotal * tax_rate * s / total_subtotal for s in effective_subtotals]
    raw_tip = [total_subtotal * tip_rate * s / total_subtotal for s in effective_subtotals]

    tax_shares = _distribute_pennies(raw_tax, total_tax)
    tip_shares = _distribute_pennies(raw_tip, total_tip)

    for i, r in enumerate(results):
        r.tax_share = tax_shares[i]
        r.tip_share = tip_shares[i]
        r.share = round(r.subtotal_share + r.tax_share + r.tip_share, 2)

    if round_to_peso:
        total_amount = round(sum(r.share for r in results))
        raw_rounded = [round(r.share) for r in results]
        adjusted = _distribute_pennies([float(x) for x in raw_rounded], float(total_amount))
        for i, r in enumerate(results):
            r.share = adjusted[i]

    return results


def compute_splits(
    split_type: str,
    subtotal: float,
    spec: dict,
    tax_rate: float = 0.0,
    tip_rate: float = 0.0,
    round_to_peso: bool = False,
    discounts: list[dict] | None = None,
) -> list[SplitResult]:
    """
    Dispatcher. Handles subtotal split, then applies discounts, tax, tip, rounding.
    discounts: [{participant_key, amount}]
    """
    if split_type == "equal":
        results = split_equal(subtotal, spec["participants"])
    elif split_type == "percentage":
        results = split_percentage(subtotal, spec["allocations"])
    elif split_type == "itemized":
        results = split_itemized(spec["items"])
    else:
        raise ValueError(f"Unknown split type: {split_type}")

    if discounts:
        disc_map = {d["participant_key"]: d["amount"] for d in discounts}
        results = apply_discounts(results, disc_map)

    if tax_rate > 0 or tip_rate > 0 or round_to_peso:
        results = apply_tax_tip(results, tax_rate, tip_rate, round_to_peso)

    return results
