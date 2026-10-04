"""Frozen output models with camelCase JSON aliases."""

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class ParserModel(BaseModel):
    """Output contract. Unknown fields are rejected; instances are frozen."""

    model_config = ConfigDict(
        frozen=True,
        extra="forbid",
        alias_generator=to_camel,
        populate_by_name=True,
        serialize_by_alias=True,
    )
