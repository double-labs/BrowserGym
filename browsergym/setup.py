from pathlib import Path
from setuptools import setup

browsergym_core: str = (Path(__file__).parent / "core").as_uri()

setup(
    install_requires=[
        f"browsergym-core @ {browsergym_core}",
        "browsergym-miniwob==0.7.1",
        "browsergym-webarena==0.7.1",
        "browsergym-visualwebarena==0.7.1",
        "browsergym-experiments==0.7.1",
        "browsergym-workarena",
    ]
)
