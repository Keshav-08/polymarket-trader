from datetime import datetime
from sqlalchemy.orm import Session
from app.models.rules import Rule, TriggerLog
from app.services.trade_executor import execute_trade, check_exit_conditions


def evaluate_rules(markets: list[dict], db: Session) -> list[dict]:
    active_rules: list[Rule] = db.query(Rule).filter(Rule.active == True).all()

    if not active_rules:
        return []

    triggers = []

    for rule in active_rules:
        keyword = rule.keyword.lower()

        matching_markets = [
            m for m in markets
            if keyword in m.get("question", "").lower()
        ]

        for market in matching_markets:
            prob = market.get("probability", 0)

            # ── Check exit conditions first if in position ──────────────────
            if rule.in_position:
                exited = check_exit_conditions(rule, prob, db)
                if exited:
                    triggers.append({
                        "rule_id": rule.id,
                        "rule_name": rule.name,
                        "action": "exit",
                        "ticker": rule.ticker,
                        "probability": prob,
                        "executed": True,
                    })
                continue  # Don't re-enter while in position

            # ── Check entry conditions ──────────────────────────────────────
            condition_met = (
                (rule.condition == "above" and prob >= rule.threshold) or
                (rule.condition == "below" and prob <= rule.threshold)
            )

            if not condition_met:
                continue

            shift = market.get("shift")
            trigger = {
                "rule_id": rule.id,
                "rule_name": rule.name,
                "market_question": market.get("question"),
                "market_id": market.get("id"),
                "probability": prob,
                "shift": shift,
                "action": rule.action,
                "ticker": rule.ticker,
                "quantity": rule.quantity,
            }

            log = TriggerLog(
                rule_id=rule.id,
                rule_name=rule.name,
                market_question=market.get("question"),
                market_id=market.get("id"),
                probability=prob,
                shift=shift,
                action=rule.action,
                ticker=rule.ticker,
                quantity=rule.quantity,
                executed=False,
                log_type="entry",
            )
            db.add(log)
            db.flush()

            rule.triggered_count = (rule.triggered_count or 0) + 1
            rule.last_triggered = datetime.utcnow()

            direction = "▲" if (shift and shift > 0) else "▼" if (shift and shift < 0) else "•"
            print(
                f"\n🚨 RULE TRIGGERED: [{rule.name}]\n"
                f"   Market  : {str(market.get('question', ''))[:80]}\n"
                f"   Prob    : {prob:.1f}% {direction}\n"
                f"   Action  : {rule.action.upper()} {rule.quantity}x {rule.ticker}\n",
                flush=True,
            )

            executed = execute_trade(trigger, log, db)
            trigger["executed"] = executed
            triggers.append(trigger)

    if triggers:
        try:
            db.commit()
        except Exception:
            db.rollback()

    return triggers