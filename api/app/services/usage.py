from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from hashlib import sha256
from zoneinfo import ZoneInfo

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models.usage_ledger import UsageLedger
from app.services.gemini import GeminiUsageTokenDetail


USD_QUANTIZE = Decimal("0.000001")
KRW_QUANTIZE = Decimal("1")
APRIL_2026_USD_TO_KRW = Decimal("1504.808272")
APRIL_2026_EXCHANGE_RATE_DATE = "2026-04-01"
KST = ZoneInfo("Asia/Seoul")


@dataclass(frozen=True)
class UsageCostBreakdown:
    prompt_tokens: int
    candidate_tokens: int
    chat_input_tokens_le_200k: int
    chat_input_tokens_gt_200k: int
    chat_output_tokens_le_200k: int
    chat_output_tokens_gt_200k: int
    image_input_tokens: int
    image_text_output_tokens: int
    image_output_tokens: int
    generated_image_count: int
    input_cost_usd: Decimal
    output_cost_usd: Decimal
    image_cost_usd: Decimal
    total_cost_usd: Decimal


@dataclass(frozen=True)
class UsageBucketTotals:
    chat_input_tokens_le_200k: int = 0
    chat_input_tokens_gt_200k: int = 0
    chat_output_tokens_le_200k: int = 0
    chat_output_tokens_gt_200k: int = 0
    image_input_tokens: int = 0
    image_text_output_tokens: int = 0
    image_output_tokens: int = 0
    generated_image_count: int = 0
    generated_image_count_05k: int = 0
    generated_image_count_1k: int = 0
    generated_image_count_2k: int = 0
    generated_image_count_4k: int = 0


@dataclass(frozen=True)
class UsageQuotaSnapshot:
    used_usd: Decimal
    remaining_usd: Decimal
    limit_usd: Decimal
    used_krw: Decimal
    remaining_krw: Decimal
    limit_krw: Decimal
    usd_to_krw_rate: Decimal
    exchange_rate_date: str
    quota_exceeded: bool


PRICING = {
    "chat": {
        "input_le_200k": Decimal("2.00") / Decimal("1000000"),
        "input_gt_200k": Decimal("4.00") / Decimal("1000000"),
        "output_le_200k": Decimal("12.00") / Decimal("1000000"),
        "output_gt_200k": Decimal("18.00") / Decimal("1000000"),
    },
    "image": {
        "input_per_token": Decimal("0.50") / Decimal("1000000"),
        "text_output_per_token": Decimal("3.00") / Decimal("1000000"),
        "per_image": {
            "0.5k": Decimal("0.045"),
            "1k": Decimal("0.067"),
            "2k": Decimal("0.101"),
            "4k": Decimal("0.151"),
        },
    },
}


def calculate_usage_cost(
    *,
    request_type: str,
    prompt_tokens: int = 0,
    candidate_tokens: int = 0,
    prompt_token_details: tuple[GeminiUsageTokenDetail, ...] = (),
    candidate_token_details: tuple[GeminiUsageTokenDetail, ...] = (),
    generated_image_count: int = 0,
    image_size: str = "1k",
) -> UsageCostBreakdown:
    if request_type == "chat":
        return _calculate_chat_cost(prompt_tokens=prompt_tokens, candidate_tokens=candidate_tokens)
    if request_type == "image":
        return _calculate_image_cost(
            prompt_tokens=prompt_tokens,
            candidate_tokens=candidate_tokens,
            prompt_token_details=prompt_token_details,
            candidate_token_details=candidate_token_details,
            generated_image_count=generated_image_count,
            image_size=image_size,
        )
    return UsageCostBreakdown(
        prompt_tokens=prompt_tokens,
        candidate_tokens=candidate_tokens,
        chat_input_tokens_le_200k=0,
        chat_input_tokens_gt_200k=0,
        chat_output_tokens_le_200k=0,
        chat_output_tokens_gt_200k=0,
        image_input_tokens=0,
        image_text_output_tokens=0,
        image_output_tokens=0,
        generated_image_count=generated_image_count,
        input_cost_usd=Decimal("0"),
        output_cost_usd=Decimal("0"),
        image_cost_usd=Decimal("0"),
        total_cost_usd=Decimal("0"),
    )


def hash_api_key(api_key: str) -> str:
    return sha256(api_key.encode("utf-8")).hexdigest()


def get_ledger_usage_bucket_totals(
    *,
    db_session: Session,
    api_key_hash: str,
    now: datetime | None = None,
) -> UsageBucketTotals:
    period_start, period_end = _current_month_range(now=now)
    row = db_session.execute(
        select(
            func.coalesce(func.sum(UsageLedger.chat_input_tokens_le_200k), 0),
            func.coalesce(func.sum(UsageLedger.chat_input_tokens_gt_200k), 0),
            func.coalesce(func.sum(UsageLedger.chat_output_tokens_le_200k), 0),
            func.coalesce(func.sum(UsageLedger.chat_output_tokens_gt_200k), 0),
            func.coalesce(func.sum(UsageLedger.image_input_tokens), 0),
            func.coalesce(func.sum(UsageLedger.image_text_output_tokens), 0),
            func.coalesce(func.sum(UsageLedger.image_output_tokens), 0),
            func.coalesce(func.sum(UsageLedger.generated_image_count), 0),
            func.coalesce(
                func.sum(
                    case(
                        (
                            (UsageLedger.image_size == "0.5k") & (UsageLedger.image_output_tokens == 0),
                            UsageLedger.generated_image_count,
                        ),
                        else_=0,
                    )
                ),
                0,
            ),
            func.coalesce(
                func.sum(
                    case(
                        (
                            (UsageLedger.image_size == "1k") & (UsageLedger.image_output_tokens == 0),
                            UsageLedger.generated_image_count,
                        ),
                        else_=0,
                    )
                ),
                0,
            ),
            func.coalesce(
                func.sum(
                    case(
                        (
                            (UsageLedger.image_size == "2k") & (UsageLedger.image_output_tokens == 0),
                            UsageLedger.generated_image_count,
                        ),
                        else_=0,
                    )
                ),
                0,
            ),
            func.coalesce(
                func.sum(
                    case(
                        (
                            (UsageLedger.image_size == "4k") & (UsageLedger.image_output_tokens == 0),
                            UsageLedger.generated_image_count,
                        ),
                        else_=0,
                    )
                ),
                0,
            ),
        ).where(
            UsageLedger.api_key_hash == api_key_hash,
            UsageLedger.status == "success",
            UsageLedger.created_at >= period_start,
            UsageLedger.created_at < period_end,
        )
    ).one()
    return UsageBucketTotals(
        chat_input_tokens_le_200k=_int_or_zero(row[0]),
        chat_input_tokens_gt_200k=_int_or_zero(row[1]),
        chat_output_tokens_le_200k=_int_or_zero(row[2]),
        chat_output_tokens_gt_200k=_int_or_zero(row[3]),
        image_input_tokens=_int_or_zero(row[4]),
        image_text_output_tokens=_int_or_zero(row[5]),
        image_output_tokens=_int_or_zero(row[6]),
        generated_image_count=_int_or_zero(row[7]),
        generated_image_count_05k=_int_or_zero(row[8]),
        generated_image_count_1k=_int_or_zero(row[9]),
        generated_image_count_2k=_int_or_zero(row[10]),
        generated_image_count_4k=_int_or_zero(row[11]),
    )


def calculate_total_cost_from_buckets(bucket_totals: UsageBucketTotals) -> Decimal:
    chat_input_cost = _quantize(
        Decimal(bucket_totals.chat_input_tokens_le_200k) * PRICING["chat"]["input_le_200k"]
        + Decimal(bucket_totals.chat_input_tokens_gt_200k) * PRICING["chat"]["input_gt_200k"]
    )
    chat_output_cost = _quantize(
        Decimal(bucket_totals.chat_output_tokens_le_200k) * PRICING["chat"]["output_le_200k"]
        + Decimal(bucket_totals.chat_output_tokens_gt_200k) * PRICING["chat"]["output_gt_200k"]
    )
    image_input_cost = _quantize(Decimal(bucket_totals.image_input_tokens) * PRICING["image"]["input_per_token"])
    image_text_output_cost = _quantize(
        Decimal(bucket_totals.image_text_output_tokens) * PRICING["image"]["text_output_per_token"]
    )
    if bucket_totals.image_output_tokens > 0:
        image_generation_cost = _quantize(Decimal(bucket_totals.image_output_tokens) * (Decimal("60.00") / Decimal("1000000")))
    else:
        image_generation_cost = _quantize(
            Decimal(bucket_totals.generated_image_count_05k) * PRICING["image"]["per_image"]["0.5k"]
            + Decimal(bucket_totals.generated_image_count_1k) * PRICING["image"]["per_image"]["1k"]
            + Decimal(bucket_totals.generated_image_count_2k) * PRICING["image"]["per_image"]["2k"]
            + Decimal(bucket_totals.generated_image_count_4k) * PRICING["image"]["per_image"]["4k"]
        )
    return _quantize(chat_input_cost + chat_output_cost + image_input_cost + image_text_output_cost + image_generation_cost)


def get_ledger_usage_total(*, db_session: Session, api_key_hash: str) -> Decimal:
    bucket_totals = get_ledger_usage_bucket_totals(db_session=db_session, api_key_hash=api_key_hash)
    return calculate_total_cost_from_buckets(bucket_totals)


def build_usage_snapshot(
    *,
    used_usd: Decimal,
    usage_limit_krw: Decimal,
    usd_to_krw_rate: Decimal = APRIL_2026_USD_TO_KRW,
    exchange_rate_date: str = APRIL_2026_EXCHANGE_RATE_DATE,
) -> UsageQuotaSnapshot:
    normalized_used = _quantize(used_usd)
    normalized_limit_krw = _quantize_krw(usage_limit_krw)
    normalized_used_krw = _quantize_krw(normalized_used * usd_to_krw_rate)
    normalized_limit_usd = _quantize(normalized_limit_krw / usd_to_krw_rate)
    normalized_remaining_usd = _quantize(max(normalized_limit_usd - normalized_used, Decimal("0")))
    normalized_remaining_krw = _quantize_krw(max(normalized_limit_krw - normalized_used_krw, Decimal("0")))
    return UsageQuotaSnapshot(
        used_usd=normalized_used,
        remaining_usd=normalized_remaining_usd,
        limit_usd=normalized_limit_usd,
        used_krw=normalized_used_krw,
        remaining_krw=normalized_remaining_krw,
        limit_krw=normalized_limit_krw,
        usd_to_krw_rate=usd_to_krw_rate,
        exchange_rate_date=exchange_rate_date,
        quota_exceeded=normalized_used_krw >= normalized_limit_krw,
    )


def get_usage_snapshot(
    *,
    db_session: Session,
    api_key_hash: str,
    usage_limit_krw: Decimal,
    usd_to_krw_rate: Decimal = APRIL_2026_USD_TO_KRW,
    exchange_rate_date: str = APRIL_2026_EXCHANGE_RATE_DATE,
) -> UsageQuotaSnapshot:
    used_usd = get_ledger_usage_total(db_session=db_session, api_key_hash=api_key_hash)
    return build_usage_snapshot(
        used_usd=used_usd,
        usage_limit_krw=usage_limit_krw,
        usd_to_krw_rate=usd_to_krw_rate,
        exchange_rate_date=exchange_rate_date,
    )


def _calculate_chat_cost(*, prompt_tokens: int, candidate_tokens: int) -> UsageCostBreakdown:
    is_long_context = prompt_tokens > 200_000
    input_rate = PRICING["chat"]["input_gt_200k" if is_long_context else "input_le_200k"]
    output_rate = PRICING["chat"]["output_gt_200k" if is_long_context else "output_le_200k"]
    input_cost = _quantize(Decimal(prompt_tokens) * input_rate)
    output_cost = _quantize(Decimal(candidate_tokens) * output_rate)
    total_cost = _quantize(input_cost + output_cost)
    return UsageCostBreakdown(
        prompt_tokens=prompt_tokens,
        candidate_tokens=candidate_tokens,
        chat_input_tokens_le_200k=0 if is_long_context else prompt_tokens,
        chat_input_tokens_gt_200k=prompt_tokens if is_long_context else 0,
        chat_output_tokens_le_200k=0 if is_long_context else candidate_tokens,
        chat_output_tokens_gt_200k=candidate_tokens if is_long_context else 0,
        image_input_tokens=0,
        image_text_output_tokens=0,
        image_output_tokens=0,
        generated_image_count=0,
        input_cost_usd=input_cost,
        output_cost_usd=output_cost,
        image_cost_usd=Decimal("0"),
        total_cost_usd=total_cost,
    )


def _calculate_image_cost(
    *,
    prompt_tokens: int,
    candidate_tokens: int,
    prompt_token_details: tuple[GeminiUsageTokenDetail, ...],
    candidate_token_details: tuple[GeminiUsageTokenDetail, ...],
    generated_image_count: int,
    image_size: str,
) -> UsageCostBreakdown:
    input_token_count = sum(detail.token_count for detail in prompt_token_details) or prompt_tokens
    image_output_tokens = sum(
        detail.token_count for detail in candidate_token_details if detail.modality == "IMAGE"
    )
    text_output_tokens = sum(
        detail.token_count for detail in candidate_token_details if detail.modality != "IMAGE"
    )

    input_cost = _quantize(Decimal(input_token_count) * PRICING["image"]["input_per_token"])
    output_cost = _quantize(Decimal(text_output_tokens) * PRICING["image"]["text_output_per_token"])
    if image_output_tokens:
        image_cost = _quantize(Decimal(image_output_tokens) * (Decimal("60.00") / Decimal("1000000")))
    else:
        image_cost = _quantize(Decimal(generated_image_count) * PRICING["image"]["per_image"][image_size])
    total_cost = _quantize(input_cost + output_cost + image_cost)
    return UsageCostBreakdown(
        prompt_tokens=prompt_tokens,
        candidate_tokens=candidate_tokens,
        chat_input_tokens_le_200k=0,
        chat_input_tokens_gt_200k=0,
        chat_output_tokens_le_200k=0,
        chat_output_tokens_gt_200k=0,
        image_input_tokens=input_token_count,
        image_text_output_tokens=text_output_tokens,
        image_output_tokens=image_output_tokens,
        generated_image_count=generated_image_count,
        input_cost_usd=input_cost,
        output_cost_usd=output_cost,
        image_cost_usd=image_cost,
        total_cost_usd=total_cost,
    )


def _quantize(value: Decimal) -> Decimal:
    return value.quantize(USD_QUANTIZE, rounding=ROUND_HALF_UP)


def _quantize_krw(value: Decimal) -> Decimal:
    return value.quantize(KRW_QUANTIZE, rounding=ROUND_HALF_UP)


def _current_month_range(now: datetime | None = None) -> tuple[datetime, datetime]:
    reference = now.astimezone(KST) if now is not None else datetime.now(KST)
    month_start = reference.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if month_start.month == 12:
        next_month = month_start.replace(year=month_start.year + 1, month=1)
    else:
        next_month = month_start.replace(month=month_start.month + 1)
    return month_start.astimezone(timezone.utc), next_month.astimezone(timezone.utc)


def _int_or_zero(value: object) -> int:
    if isinstance(value, int):
        return value
    if isinstance(value, Decimal):
        return int(value)
    return int(value or 0)
