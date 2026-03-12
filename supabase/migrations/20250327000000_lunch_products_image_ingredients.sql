-- Voeg image_url toe aan lunch_products; description = ingredienten
alter table lunch_products add column if not exists image_url text;

comment on column lunch_products.image_url is 'URL van productafbeelding';
comment on column lunch_products.description is 'Ingrediënten / beleg';

-- Placeholder-afbeeldingen voor bestaande producten (beheerder kan later echte URLs invullen)
update lunch_products
set image_url = 'https://placehold.co/120x96/f0c040/0d1f4e?text=Broodje'
where image_url is null;
