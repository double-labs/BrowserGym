import re
from typing import NamedTuple


class AriaData(NamedTuple):
    bid: str
    href: str
    original_aria: str
    visibility: bool

    @staticmethod
    def bid_from_aria_string(aria_string: str) -> str:
        match = re.search(r"<\|bid\|>(.*?)<\|bid\|>", aria_string)
        if not match:
            return ""
        return match.group(1)

    @staticmethod
    def href_from_aria_string(aria_string: str) -> str:
        match = re.search(r"<\|href\|>(.*?)<\|href\|>", aria_string)
        if not match:
            return ""
        return match.group(1)

    @staticmethod
    def original_aria_from_aria_string(aria_string: str) -> str:
        match = re.search(r"<\|original_aria\|>(.*?)<\|original_aria\|>", aria_string)
        if not match:
            return ""
        return match.group(1)

    @staticmethod
    def visibility_from_aria_string(aria_string: str) -> bool:
        """
        We default to True
        This is just based on the assumption that this will perform better
        """
        match = re.search(r"<\|visibility\|>(.*?)<\|visibility\|>", aria_string)
        if not match:
            return True
        match = match.group(1)
        if match == "true":
            return True
        elif match == "false":
            return False
        return True

    @classmethod
    def from_aria_string(cls, aria_string: str) -> "AriaData":
        bid = AriaData.bid_from_aria_string(aria_string)
        href = AriaData.href_from_aria_string(aria_string)
        original_aria = AriaData.original_aria_from_aria_string(aria_string)
        visibility = AriaData.visibility_from_aria_string(aria_string)
        return cls(bid, href, original_aria, visibility)
