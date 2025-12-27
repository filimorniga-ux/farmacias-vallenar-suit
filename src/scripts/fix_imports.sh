#!/bin/bash

# useStore.ts
sed -i '' "s/'..\/..\/actions\/locations'/'..\/..\/actions\/locations-v2'/g" src/presentation/store/useStore.ts
sed -i '' "s/'..\/..\/actions\/sync'/'..\/..\/actions\/sync-v2'/g" src/presentation/store/useStore.ts
sed -i '' "s/'..\/..\/actions\/wms'/'..\/..\/actions\/wms-v2'/g" src/presentation/store/useStore.ts
sed -i '' "s/'..\/..\/actions\/supply'/'..\/..\/actions\/supply-v2'/g" src/presentation/store/useStore.ts
sed -i '' "s/'..\/..\/actions\/suppliers'/'..\/..\/actions\/suppliers-v2'/g" src/presentation/store/useStore.ts
sed -i '' "s/'..\/..\/actions\/quotes'/'..\/..\/actions\/quotes-v2'/g" src/presentation/store/useStore.ts
sed -i '' "s/'..\/..\/actions\/terminals'/'..\/..\/actions\/terminals-v2'/g" src/presentation/store/useStore.ts
sed -i '' "s/'..\/..\/actions\/network'/'..\/..\/actions\/network-v2'/g" src/presentation/store/useStore.ts
sed -i '' "s/'..\/..\/actions\/security'/'..\/..\/actions\/security-v2'/g" src/presentation/store/useStore.ts
sed -i '' "s/'..\/..\/actions\/attendance'/'..\/..\/actions\/attendance-v2'/g" src/presentation/store/useStore.ts
sed -i '' "s/'..\/..\/actions\/queue'/'..\/..\/actions\/queue-v2'/g" src/presentation/store/useStore.ts
sed -i '' "s/'..\/..\/actions\/customers'/'..\/..\/actions\/customers-v2'/g" src/presentation/store/useStore.ts
sed -i '' "s/'..\/..\/actions\/sales'/'..\/..\/actions\/sales-v2'/g" src/presentation/store/useStore.ts
sed -i '' "s/'..\/..\/actions\/cash'/'..\/..\/actions\/cash-v2'/g" src/presentation/store/useStore.ts

# OrganizationManager.tsx
sed -i '' "s/'@\/actions\/network'/'@\/actions\/network-v2'/g" src/presentation/components/settings/OrganizationManager.tsx
sed -i '' "s/'@\/actions\/terminals'/'@\/actions\/terminals-v2'/g" src/presentation/components/settings/OrganizationManager.tsx

# TigerDataService.ts
sed -i '' "s/'..\/..\/actions\/inventory'/'..\/..\/actions\/inventory-v2'/g" src/domain/services/TigerDataService.ts
sed -i '' "s/'..\/..\/actions\/customers'/'..\/..\/actions\/customers-v2'/g" src/domain/services/TigerDataService.ts
sed -i '' "s/'..\/..\/actions\/sales'/'..\/..\/actions\/sales-v2'/g" src/domain/services/TigerDataService.ts
sed -i '' "s/'..\/..\/actions\/cash'/'..\/..\/actions\/cash-v2'/g" src/domain/services/TigerDataService.ts
sed -i '' "s/'..\/..\/actions\/wms'/'..\/..\/actions\/wms-v2'/g" src/domain/services/TigerDataService.ts

# Otros archivos
sed -i '' "s/'@\/actions\/operations'/'@\/actions\/operations-v2'/g" src/app/caja/page.tsx
sed -i '' "s/'@\/actions\/logger-action'/'@\/actions\/logger-action-v2'/g" src/app/proveedores/page.tsx
sed -i '' "s/'@\/actions\/operations'/'@\/actions\/operations-v2'/g" src/app/totem/page.tsx
sed -i '' "s/'..\/..\/..\/actions\/security'/'..\/..\/..\/actions\/security-v2'/g" src/presentation/components/security/SessionGuard.tsx
sed -i '' "s/'..\/..\/..\/actions\/sync'/'..\/..\/..\/actions\/sync-v2'/g" src/presentation/components/inventory/BulkImportModal.tsx
sed -i '' "s/'..\/..\/actions\/inventory'/'..\/..\/actions\/inventory-v2'/g" src/presentation/pages/InventoryPage.tsx
sed -i '' "s/'..\/..\/actions\/maintenance'/'..\/..\/actions\/maintenance-v2'/g" src/presentation/pages/DashboardPage.tsx
sed -i '' "s/'..\/..\/actions\/dashboard'/'..\/..\/actions\/dashboard-v2'/g" src/presentation/pages/DashboardPage.tsx
sed -i '' "s/'@\/actions\/network'/'@\/actions\/network-v2'/g" src/presentation/store/useLocationStore.ts

echo "Reemplazos completados"
