from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel


class UsageQuotaResponse(BaseModel):
    used_usd: Decimal
    remaining_usd: Decimal
    limit_usd: Decimal
    quota_exceeded: bool
