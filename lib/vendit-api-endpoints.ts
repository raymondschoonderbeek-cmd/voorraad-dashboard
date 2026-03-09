/**
 * Vendit Public API GET-endpoints voor de API Tester module.
 * Bron: https://api2.vendit.online/VenditPublicApiSpec/index.html
 */

export type VenditEndpoint = {
  path: string
  label: string
  params: { name: string; placeholder: string }[]
  method?: 'GET' | 'POST'
  bodyPlaceholder?: string
}

export const VENDIT_GET_ENDPOINTS: VenditEndpoint[] = [
  { path: '/VenditPublicApi/Brands/GetAll', label: 'Brands – GetAll', params: [] },
  { path: '/VenditPublicApi/Brands/{id}', label: 'Brands – By ID', params: [{ name: 'id', placeholder: 'Brand ID' }] },
  { path: '/VenditPublicApi/Branches/GetAll', label: 'Branches – GetAll', params: [] },
  { path: '/VenditPublicApi/Branches/{id}', label: 'Branches – By ID', params: [{ name: 'id', placeholder: 'Branch ID' }] },
  { path: '/VenditPublicApi/Customers/{id}/{details}', label: 'Customers – By ID', params: [{ name: 'id', placeholder: 'Customer ID' }, { name: 'details', placeholder: 'true/false' }] },
  { path: '/VenditPublicApi/Employees/GetAll', label: 'Employees – GetAll', params: [] },
  { path: '/VenditPublicApi/Employees/{id}', label: 'Employees – By ID', params: [{ name: 'id', placeholder: 'Employee ID' }] },
  { path: '/VenditPublicApi/Offices/GetAll', label: 'Offices – GetAll', params: [] },
  { path: '/VenditPublicApi/Offices/{id}', label: 'Offices – By ID', params: [{ name: 'id', placeholder: 'Office ID' }] },
  { path: '/VenditPublicApi/Products/{id}', label: 'Products – By ID', params: [{ name: 'id', placeholder: 'Product ID' }] },
  { path: '/VenditPublicApi/Products/GetAllAttributeDefinitions', label: 'Products – GetAllAttributeDefinitions', params: [] },
  { path: '/VenditPublicApi/ProductSizeColors/GetProductSizeColors/{productId}', label: 'ProductSizeColors – Maat/kleur per product', params: [{ name: 'productId', placeholder: 'Product ID' }] },
  { path: '/VenditPublicApi/ProductStock/{productId}/{sizeColorId}/{officeId}', label: 'ProductStock – Voorraad per product/variant/vestiging', params: [{ name: 'productId', placeholder: 'Product ID' }, { name: 'sizeColorId', placeholder: 'SizeColor ID' }, { name: 'officeId', placeholder: 'Office ID' }] },
  { path: '/VenditPublicApi/ProductStock/GetChangedStockFromDate/{unixMillisec}/{ensureZeroIncluded}', label: 'ProductStock – Wijzigingen sinds datum', params: [{ name: 'unixMillisec', placeholder: 'Unix ms (bijv. 1704067200000)' }, { name: 'ensureZeroIncluded', placeholder: 'true of false' }] },
  { path: '/VenditPublicApi/Offers/{id}', label: 'Offers – By ID', params: [{ name: 'id', placeholder: 'Offer ID' }] },
  { path: '/VenditPublicApi/Offers/GetWithDetails/{id}', label: 'Offers – Met details (producten)', params: [{ name: 'id', placeholder: 'Offer ID' }] },
  { path: '/VenditPublicApi/Offers/GetForCustomer/{customerId}', label: 'Offers – Per klant', params: [{ name: 'customerId', placeholder: 'Customer ID' }] },
  { path: '/VenditPublicApi/Offers/GetAllIds', label: 'Offers – GetAllIds', params: [] },
  { path: '/VenditPublicApi/Orders/{id}', label: 'Orders – By ID', params: [{ name: 'id', placeholder: 'Order ID' }] },
  { path: '/VenditPublicApi/Orders/GetWithDetails/{id}', label: 'Orders – Met details (producten, aanbetalingen)', params: [{ name: 'id', placeholder: 'Order ID' }] },
  { path: '/VenditPublicApi/Orders/GetForCustomer/{customerId}', label: 'Orders – Per klant', params: [{ name: 'customerId', placeholder: 'Customer ID' }] },
  { path: '/VenditPublicApi/Orders/GetAllIds', label: 'Orders – GetAllIds', params: [] },
  { path: '/VenditPublicApi/Orders/Find', label: 'Orders – Find (POST, overzicht zonder IDs)', params: [], method: 'POST', bodyPlaceholder: '{"fieldFilters": [], "paginationOffset": 0, "includeEntities": true}' },
  { path: '/VenditPublicApi/Orders/GetMultiple', label: 'Orders – GetMultiple (POST)', params: [], method: 'POST', bodyPlaceholder: '{"primaryKeys": [1, 2, 3]}' },
  { path: '/VenditPublicApi/StockOfficeOrders/GetAll', label: 'StockOfficeOrders – GetAll (stock transfers)', params: [] },
  { path: '/VenditPublicApi/StockOfficeTransfers/GetAll', label: 'StockOfficeTransfers – GetAll (lopende transfers)', params: [] },
  { path: '/VenditPublicApi/Suppliers/GetAllIds', label: 'Suppliers – GetAllIds', params: [] },
  { path: '/VenditPublicApi/Suppliers/{id}', label: 'Suppliers – By ID', params: [{ name: 'id', placeholder: 'Supplier ID' }] },
  { path: '/VenditPublicApi/PurchaseOrders/{id}', label: 'PurchaseOrders – By ID', params: [{ name: 'id', placeholder: 'PurchaseOrder ID' }] },
  { path: '/VenditPublicApi/PurchaseOrders/GetWithDetails/{id}', label: 'PurchaseOrders – Met details (producten)', params: [{ name: 'id', placeholder: 'PurchaseOrder ID' }] },
  { path: '/VenditPublicApi/PurchaseOrders/GetAllIds', label: 'PurchaseOrders – GetAllIds', params: [] },
  { path: '/VenditPublicApi/HistoryPurchaseOrders/{id}', label: 'HistoryPurchaseOrders – By ID', params: [{ name: 'id', placeholder: 'HistoryPurchaseOrder ID' }] },
  { path: '/VenditPublicApi/HistoryPurchaseOrders/GetWithDetails/{id}', label: 'HistoryPurchaseOrders – Met details (producten)', params: [{ name: 'id', placeholder: 'HistoryPurchaseOrder ID' }] },
  { path: '/VenditPublicApi/PrePurchaseOrders/GetAll', label: 'PrePurchaseOrders – GetAll (productpreorders)', params: [] },
  { path: '/VenditPublicApi/PrePurchaseOrders/{id}', label: 'PrePurchaseOrders – By ID', params: [{ name: 'id', placeholder: 'PrePurchaseOrder ID' }] },
  { path: '/VenditPublicApi/Transactions/{id}', label: 'Transactions – By ID', params: [{ name: 'id', placeholder: 'Transaction ID' }] },
  { path: '/VenditPublicApi/Transactions/GetWithDetails/{id}/{details}', label: 'Transactions – Met details (producten, betalingen)', params: [{ name: 'id', placeholder: 'Transaction ID' }, { name: 'details', placeholder: 'true of false' }] },
  { path: '/VenditPublicApi/Transactions/GetForCustomer/{customerId}', label: 'Transactions – Per klant', params: [{ name: 'customerId', placeholder: 'Customer ID' }] },
  { path: '/VenditPublicApi/Repairs/{id}', label: 'Repairs – By ID', params: [{ name: 'id', placeholder: 'Repair ID' }] },
  { path: '/VenditPublicApi/Repairs/GetWithDetails/{id}/{details}', label: 'Repairs – Met details (producten, accessoires)', params: [{ name: 'id', placeholder: 'Repair ID' }, { name: 'details', placeholder: 'true of false' }] },
  { path: '/VenditPublicApi/Repairs/GetForCustomer/{customerId}', label: 'Repairs – Per klant', params: [{ name: 'customerId', placeholder: 'Customer ID' }] },
  { path: '/VenditPublicApi/Repairs/GetAllIds', label: 'Repairs – GetAllIds', params: [] },
  { path: '/VenditPublicApi/Lookups/RepairCodes/GetAll', label: 'Lookups – RepairCodes GetAll', params: [] },
  { path: '/VenditPublicApi/Lookups/RepairCodes/{id}', label: 'Lookups – RepairCodes By ID', params: [{ name: 'id', placeholder: 'RepairCode ID' }] },
  { path: '/VenditPublicApi/Lookups/RepairKinds/GetAll', label: 'Lookups – RepairKinds GetAll', params: [] },
  { path: '/VenditPublicApi/Lookups/RepairKinds/{id}', label: 'Lookups – RepairKinds By ID', params: [{ name: 'id', placeholder: 'RepairKind ID' }] },
  { path: '/VenditPublicApi/Lookups/RepairStatuses/GetAll', label: 'Lookups – RepairStatuses GetAll', params: [] },
  { path: '/VenditPublicApi/Lookups/RepairStatuses/{id}', label: 'Lookups – RepairStatuses By ID', params: [{ name: 'id', placeholder: 'RepairStatus ID' }] },
  { path: '/VenditPublicApi/Lookups/OfferStatuses/GetAll', label: 'Lookups – OfferStatuses GetAll', params: [] },
  { path: '/VenditPublicApi/Lookups/OfferStatuses/{id}', label: 'Lookups – OfferStatuses By ID', params: [{ name: 'id', placeholder: 'OfferStatus ID' }] },
  { path: '/VenditPublicApi/Lookups/OrderStatuses/GetAll', label: 'Lookups – OrderStatuses GetAll', params: [] },
  { path: '/VenditPublicApi/Lookups/OrderStatuses/{id}', label: 'Lookups – OrderStatuses By ID', params: [{ name: 'id', placeholder: 'OrderStatus ID' }] },
  { path: '/VenditPublicApi/Lookups/OrderTypes/GetAll', label: 'Lookups – OrderTypes GetAll', params: [] },
  { path: '/VenditPublicApi/Lookups/OrderTypes/{id}', label: 'Lookups – OrderTypes By ID', params: [{ name: 'id', placeholder: 'OrderType ID' }] },
  { path: '/VenditPublicApi/Lookups/Countries/GetAll', label: 'Lookups – Countries GetAll', params: [] },
  { path: '/VenditPublicApi/Lookups/CustomerGroups/GetAll', label: 'Lookups – CustomerGroups GetAll', params: [] },
  { path: '/VenditPublicApi/Lookups/ProductKinds/GetAll', label: 'Lookups – ProductKinds GetAll', params: [] },
  { path: '/VenditPublicApi/Lookups/SalesUnits/GetAll', label: 'Lookups – SalesUnits GetAll', params: [] },
  { path: '/VenditPublicApi/Lookups/VatDefinitions/GetAll', label: 'Lookups – VatDefinitions GetAll', params: [] },
  { path: '/VenditPublicApi/Lookups/AvailabilityStatuses/GetAll', label: 'Lookups – AvailabilityStatuses GetAll', params: [] },
  { path: '/VenditPublicApi/Utils/CheckApiKeyAndToken', label: 'Utils – CheckApiKeyAndToken', params: [] },
]

/** Endpoints zonder parameters, geschikt voor Discovery-scan (alleen GET) */
export const VENDIT_DISCOVERY_ENDPOINTS = VENDIT_GET_ENDPOINTS.filter(e => !e.params?.length && e.method !== 'POST')
