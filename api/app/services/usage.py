from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from hashlib import sha256

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.usage_ledger import UsageLedger
from app.services.gemini import GeminiUsageTokenDetail


USD_QUANTIZE = Decimal("0.000001")
KRW_QUANTIZE = Decimal("1")
APRIL_2026_USD_TO_KRW = Decimal("1504.808272")
APRIL_2026_EXCHANGE_RATE_DATE = "2026-04-01"


@dataclass(frozen=True)
class UsageCostBreakdown:
    prompt_tokens: int
    candidate_tokens: int
    generated_image_count: int
    input_cost_usd: Decimal
    output_cost_usd: Decimal
    image_cost_usd: Decimal
    total_cost_usd: Decimal


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
        generated_image_count=generated_image_count,
        input_cost_usd=Decimal("0"),
        output_cost_usd=Decimal("0"),
        image_cost_usd=Decimal("0"),
        total_cost_usd=Decimal("0"),
    )


def hash_api_key(api_key: str) -> str:
    return sha256(api_key.encode("utf-8")).hexdigest()


def get_ledger_usage_total(*, db_session: Session, api_key_hash: str) -> Decimal:
    total = db_session.scalar(
        select(func.coalesce(func.sum(UsageLedger.total_cost_usd), Decimal("0"))).where(
            UsageLedger.api_key_hash == api_key_hash,
            UsageLedger.status == "success",
        )
    )
    if isinstance(total, Decimal):
        return _quantize(total)
    return _quantize(Decimal(str(total or 0)))


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
