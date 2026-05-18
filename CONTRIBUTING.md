# Contributing to GONetView

Thank you for helping improve GONetView. The project is intended to be useful, reproducible research software, so small bug reports and documentation fixes are valuable.

## Development Setup

Install frontend dependencies:

```powershell
npm.cmd --prefix frontend install
```

Run the development server:

```powershell
npm.cmd --prefix frontend run dev
```

Regenerate browser data from the bundled raw GO inputs:

```powershell
.\.venv\Scripts\python.exe scripts\preprocess_data.py
```

## Checks Before a Pull Request

Run Python parser tests:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests
```

Run frontend tests and type checks:

```powershell
npm.cmd --prefix frontend test
npm.cmd --prefix frontend run test:browser
npm.cmd --prefix frontend run build
```

## Contribution Workflow

1. Open an issue describing the bug, feature, data update, or documentation gap.
2. Keep pull requests focused on one topic.
3. Include tests for parser, preprocessing, graph, or search behavior when the behavior changes.
4. Update documentation when user-facing behavior or data assumptions change.
5. Do not commit generated local folders such as `frontend/dist/`, `frontend/.test-build/`, `.venv/`, `.vite/`, or `local/`.

## Data Updates

When replacing files under `data/raw/`, update `data/raw/README.md` with the source, version, and date. After regenerating `frontend/public/data/`, verify that the app still builds and that generated manifests contain the expected organisms.

## Support Expectations

GONetView is maintained as research software. Please use GitHub Issues for reproducible bugs, data problems, and feature requests. Include browser, operating system, example GO terms or genes, selected organism, and any console errors when reporting UI problems.
