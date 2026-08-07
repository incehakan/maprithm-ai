const fs = require('fs'); 
const files = ['src/app/(dashboard)/orders/page.tsx','src/app/(dashboard)/products/new/page.tsx','src/app/(dashboard)/products/[id]/edit/product-form.tsx','src/app/(dashboard)/settings/page.tsx','src/app/(dashboard)/store/page.tsx','src/components/products/ProductHealthClient.tsx','src/components/products/TrendyolPublishPreviewModal.tsx','src/components/store/StoreUsersClient.tsx']; 
for(const f of files) { 
  if(!fs.existsSync(f)) continue; 
  const content = fs.readFileSync(f, 'utf8'); 
  const matches = content.match(/className=\"[^\"]*grid-cols-[2-4][^\"]*\"/g); 
  if(matches) { 
    const b = matches.filter(m => !m.includes('sm:grid-cols') && !m.includes('md:grid-cols') && !m.includes('lg:grid-cols') && !m.includes('xl:grid-cols')); 
    if(b.length > 0) console.log(f, b); 
  } 
}
