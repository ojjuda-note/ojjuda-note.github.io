-- Retire the seven cosmetic products without altering existing purchases or ZU.
-- Do not drop ojjuda_shop_internal: photo_help_buy shares this schema.
update ojjuda_shop_internal.products
set active = false
where key in ('card_stickers','card_fonts','card_foil','profile_flower','profile_mint','nickname_star','game_night')
  and active;
