# Cosmetic storefront retired

The World and Park storefront, purchase buttons, old shop assets and unused house bridge are removed. Game buttons retain three mobile columns with larger labels, distinct covers and stronger borders. Notices scroll continuously; the original note logo takes its fill from the active theme.

Apply `ops/retire-cosmetic-sales.sql` to stop all seven cosmetic products. Existing `ju_shop_buy` requests reject inactive products before spending ZU, while prior receipt retries remain idempotent. Do not delete balances, receipts, entitlements or selections. `photo_help_buy` shares the private schema and remains available to games.

`ju-decorations.js` only reads existing ownership and renders decorations. Previously purchased card controls appear only while their entitlement is valid; already applied stickers remain on published cards. No storefront or purchase/equip actions are exposed. Historical migrations and receipt tests remain for reproducibility.
