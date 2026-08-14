# Homeboard Versioning

Homeboard uses `MAJOR.PRODUCT.UPDATE`.

- Increment `MAJOR` for major lifecycle changes such as beta to production.
- Increment `PRODUCT` for substantial product pivots or major interface redesigns.
- Increment `UPDATE` for focused features, fixes, and incremental improvements.

The current version is `0.0.13`.

Keep these values synchronized:

- `package.json`
- The root package in `package-lock.json`
- `MARKETING_VERSION` for every target in `ios/HomeboardNative/project.yml`

The welcome screen reads `CFBundleShortVersionString`, so regenerating the
Xcode project after a version change updates the visible version automatically.
