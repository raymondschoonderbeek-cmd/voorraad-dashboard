/**
 * Vendit Public API GET-endpoints voor de API Tester module.
 * Bron: https://api2.vendit.online/VenditPublicApiSpec/index.html
 */

export type VenditEndpoint = {
  path: string
  label: string
  params: { name: string; placeholder: string }[]
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
  { path: '/VenditPublicApi/ProductStock/{productId}/{sizeColorId}/{officeId}', label: 'ProductStock – By product/size/office', params: [{ name: 'productId', placeholder: 'Product ID' }, { name: 'sizeColorId', placeholder: 'SizeColor ID' }, { name: 'officeId', placeholder: 'Office ID' }] },
  { path: '/VenditPublicApi/Suppliers/GetAllIds', label: 'Suppliers – GetAllIds', params: [] },
  { path: '/VenditPublicApi/Suppliers/{id}', label: 'Suppliers – By ID', params: [{ name: 'id', placeholder: 'Supplier ID' }] },
  { path: '/VenditPublicApi/Lookups/Countries/GetAll', label: 'Lookups – Countries GetAll', params: [] },
  { path: '/VenditPublicApi/Lookups/CustomerGroups/GetAll', label: 'Lookups – CustomerGroups GetAll', params: [] },
  { path: '/VenditPublicApi/Lookups/ProductKinds/GetAll', label: 'Lookups – ProductKinds GetAll', params: [] },
  { path: '/VenditPublicApi/Lookups/SalesUnits/GetAll', label: 'Lookups – SalesUnits GetAll', params: [] },
  { path: '/VenditPublicApi/Lookups/VatDefinitions/GetAll', label: 'Lookups – VatDefinitions GetAll', params: [] },
  { path: '/VenditPublicApi/Lookups/AvailabilityStatuses/GetAll', label: 'Lookups – AvailabilityStatuses GetAll', params: [] },
  { path: '/VenditPublicApi/Utils/CheckApiKeyAndToken', label: 'Utils – CheckApiKeyAndToken', params: [] },
]

/** Endpoints zonder parameters, geschikt voor Discovery-scan */
export const VENDIT_DISCOVERY_ENDPOINTS = VENDIT_GET_ENDPOINTS.filter(e => !e.params?.length)
