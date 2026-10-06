import ast
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent

ALLOWED = {
    "utils": set(),
    "providers": set(),
    "database": {"config"},
    "core": {"config", "database", "providers", "utils"},
    "api": {"config", "core", "database", "providers", "utils"},
    "chatbot": {"config", "core", "database", "providers", "utils"},
}
LOCAL = set(ALLOWED) | {"config"}


def _local_imports(path: Path) -> set[str]:
    imported = set()
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            imported.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            imported.add(node.module.split(".")[0])
    return imported & LOCAL


@pytest.mark.parametrize("package", sorted(ALLOWED))
def test_package_imports_only_lower_layers(package):
    for path in sorted((BACKEND / package).rglob("*.py")):
        forbidden = _local_imports(path) - ALLOWED[package] - {package}
        assert not forbidden, f"{path.relative_to(BACKEND)} imports {sorted(forbidden)}"
