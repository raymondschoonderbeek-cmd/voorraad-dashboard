# Vendit API – gebruikte endpoints voor prijzen

Voor het ophalen van voorraad met prijzen gebruiken we de volgende endpoints:

## 1. Verkoopprijzen (sales prices)

### Endpoint 1a: GetProductSalePricesChangedSince (bulk, eerste poging)
```
GET https://api2.vendit.online/VenditPublicApi/Products/GetProductSalePricesChangedSince/0
```
- **Parameters:** `since` = 0 (Unix milliseconden, 0 = alle wijzigingen)
- **Headers:** ApiKey, Token, Accept: application/json
- **Probleem:** Levert vaak een lege response (`[]` of `{ items: [] }`)

### Endpoint 1b: GetPrices (fallback, per product)
```
GET https://api2.vendit.online/VenditPublicApi/Products/{productId}/GetPrices/0/{officeId}
```
- **Parameters:**
  - `productId` (path): ID van het product
  - `sizeColorId` (path): **0** (alle maat/kleur-varianten)
  - `officeId` (path): **0** (vestiging van API-key) – wordt meegegeven uit de voorraad-request
- **Headers:** ApiKey, Token, Accept: application/json
- **Gebruik:** Wordt per product aangeroepen (batches van 8) als GetProductSalePricesChangedSince leeg is

## 2. Inkoopprijzen (purchase prices)

We halen inkoopprijzen op via **GetSuppliers** (zelfde call als voor artikelnummer leverancier):
```
GET https://api2.vendit.online/VenditPublicApi/Products/{productId}/GetSuppliers/0/0
```
- **Parameters:** productId, sizeColorId=0, officeId=0
- **Response:** ProductSupplierCollection met o.a. `supplierProductNumber`, `purchasePriceEx`
- **Let op:** Vereist ViewPurchasePrice privilege – anders is prijs 0

## 3. Gewenste prijsvelden

We proberen de volgende velden te vullen:
- `salesPriceEx`, `salesPriceInc`
- `recommendedSalesPriceEx`, `recommendedSalesPriceInc`
- `purchasePriceEx`, `minSalesPriceEx`, `internetSalesPriceEx`
- `productSalesPriceEx`, `productSalesPriceInc`, `productPurchasePriceEx`
- `avgPurchasePriceEx`, `brutoPurchasePriceEx`

## 4. Vraag aan Vendit

**Welke endpoints en parameters moeten we gebruiken om verkoopprijzen (en optioneel inkoopprijzen) per product op te halen?**

- Geeft `GetProductSalePricesChangedSince/0` bij jullie wel data terug?
- Welk response-formaat (veldnamen) heeft `GetPrices`? (productId, officeId, productSizeColorId, salesPriceEx, recommendedSalesPriceEx, etc.)
- Is `officeId=-1` correct voor “alle vestigingen” of moeten we `officeId=0` gebruiken voor de vestiging van de API-key?
