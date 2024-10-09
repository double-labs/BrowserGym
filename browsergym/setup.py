from setuptools import setup

setup(
    install_requires=[
        "browsergym-workarena @ git+ssh://git@github.com/double-labs/WorkArena.git",
        "browsergym-core @ git+ssh://git@github.com/double-labs/BrowserGym.git@main#subdirectory=browsergym",
        "browsergym-miniwob==0.7.1",
        "browsergym-webarena==0.7.1",
        "browsergym-visualwebarena==0.7.1",
        "browsergym-experiments==0.7.1",
    ]
)
