# Administrative Boundary Import Guide

## Step 1: Download Boundary Shapefiles

### Option A: GADM Database (Recommended)
Download administrative boundaries from https://gadm.org/

Required downloads:
- **Nepal**: https://geodata.ucdavis.edu/gadm/gadm4.1/shp/gadm41_NPL_shp.zip
  - Extract and use `gadm41_NPL_1.shp` (provinces/regions)
  
- **India**: https://geodata.ucdavis.edu/gadm/gadm4.1/shp/gadm41_IND_shp.zip
  - Extract and use `gadm41_IND_1.shp` (states)
  
- **Pakistan**: https://geodata.ucdavis.edu/gadm/gadm4.1/shp/gadm41_PAK_shp.zip
  - Extract and use `gadm41_PAK_1.shp`
  
- **Bangladesh**: https://geodata.ucdavis.edu/gadm/gadm4.1/shp/gadm41_BGD_shp.zip
  - Extract and use `gadm41_BGD_1.shp`
  
- **China**: https://geodata.ucdavis.edu/gadm/gadm4.1/shp/gadm41_CHN_shp.zip
  - Extract and use `gadm41_CHN_1.shp`
  
- **Bhutan**: https://geodata.ucdavis.edu/gadm/gadm4.1/shp/gadm41_BTN_shp.zip
  - Extract and use `gadm41_BTN_1.shp`
  
- **Sri Lanka**: https://geodata.ucdavis.edu/gadm/gadm4.1/shp/gadm41_LKA_shp.zip
  - Extract and use `gadm41_LKA_0.shp` (country level)

### Option B: Natural Earth Data (Simpler, Lower Detail)
Download from https://www.naturalearthdata.com/downloads/
- Admin 1 – States, Provinces: `ne_10m_admin_1_states_provinces.shp`

## Step 2: Extract Shapefiles

Create a directory for boundaries:
```bash
mkdir -p ~/Downloads/DHM_SYNOP_PLOT/boundaries
cd ~/Downloads/DHM_SYNOP_PLOT/boundaries
```

Extract each downloaded zip file:
```bash
unzip gadm41_NPL_shp.zip -d nepal
unzip gadm41_IND_shp.zip -d india
unzip gadm41_PAK_shp.zip -d pakistan
unzip gadm41_BGD_shp.zip -d bangladesh
unzip gadm41_CHN_shp.zip -d china
unzip gadm41_BTN_shp.zip -d bhutan
unzip gadm41_LKA_shp.zip -d srilanka
```

## Step 3: Import Shapefiles to PostgreSQL

Use the provided import script:

```bash
cd ~/Downloads/DHM_SYNOP_PLOT

sudo ./import.sh boundries/gadm41_NPL_1.shp province

sudo ./import.sh boundries/gadm41_IND_1.shp ind_adm1

sudo ./import.sh boundries/gadm41_PAK_1.shp pak_adm1

sudo ./import.sh boundries/gadm41_BGD_1.shp bgd_adm1

sudo ./import.sh boundries/gadm41_CHN_1.shp chn_adm1

sudo ./import.sh boundries/gadm41_BTN_1.shp btn_adm1

sudo ./import.sh boundries/gadm41_LKA_0.shp lka_adm0
```

## Step 4: Publish Layers in GeoServer

For each imported table:

1. Open GeoServer: http://localhost:8080/geoserver
2. Login: admin / geoserver
3. Go to **Layers** → **Add new layer**
4. Select **weather_data** store
5. Click **Publish** next to the layer name
6. Configure:
   - **Name**: Change to match frontend expectations:
     - `province` → `province` (keep as is, will use as `DHM:province`)
     - `ind_adm1` → `IND_adm1`
     - `pak_adm1` → `PAK_adm1`
     - `bgd_adm1` → `BGD_adm1`
     - `chn_adm1` → `CHN_adm1`
     - `btn_adm1` → `BTN_adm1`
     - `lka_adm0` → `LKA_adm0`
   - **Declared SRS**: EPSG:4326
   - Click **Compute from data** for Native Bounding Box
   - Click **Compute from native bounds** for Lat/Lon Bounding Box
7. Click **Save**

## Step 5: Verify Layer Names

Your layers should be accessible as:
- `NepalAdmin:province` (or `DHM:province` if using DHM workspace)
- `NepalAdmin:IND_adm1` (or `DHM:IND_adm1`)
- `NepalAdmin:PAK_adm1` (or `DHM:PAK_adm1`)
- `NepalAdmin:BGD_adm1` (or `DHM:BGD_adm1`)
- `NepalAdmin:CHN_adm1` (or `DHM:CHN_adm1`)
- `NepalAdmin:BTN_adm1` (or `DHM:BTN_adm1`)
- `NepalAdmin:LKA_adm0` (or `DHM:LKA_adm0`)

## Step 6: Enable in Frontend

After all layers are published, revert the change in `frontend/layers.js`:

```javascript
export const baseLayers = new LayerGroup({
  title: 'Base Layers',
  openInLayerSwitcher: true,
  layers: [osmLayer, nepal, bhutan, indiaState, pakistan, bangladesh, srilanka, china]
});
```

## Quick Verification

Check if tables were imported:
```bash
psql -U komal -d weather_map -c "\dt *adm*"
```

Check record counts:
```bash
psql -U komal -d weather_map -c "SELECT 'province' as table, COUNT(*) FROM province UNION ALL SELECT 'ind_adm1', COUNT(*) FROM ind_adm1 UNION ALL SELECT 'pak_adm1', COUNT(*) FROM pak_adm1 UNION ALL SELECT 'bgd_adm1', COUNT(*) FROM bgd_adm1 UNION ALL SELECT 'chn_adm1', COUNT(*) FROM chn_adm1 UNION ALL SELECT 'btn_adm1', COUNT(*) FROM btn_adm1 UNION ALL SELECT 'lka_adm0', COUNT(*) FROM lka_adm0;"
```

## Troubleshooting

**Problem**: Shapefile import fails with encoding error
- **Solution**: Try `-W UTF-8` instead of `-W LATIN1` in the import script

**Problem**: GeoServer shows empty bounding box
- **Solution**: The table is empty or has no geometry data. Verify with:
  ```bash
  psql -U komal -d weather_map -c "SELECT COUNT(*), ST_Extent(geom) FROM table_name;"
  ```

**Problem**: Layer not showing on map
- **Solution**: 
  1. Check workspace name matches (DHM vs NepalAdmin)
  2. Verify layer is enabled in GeoServer
  3. Check browser console for WMS errors
  4. Verify coordinate system is EPSG:4326

## Alternative: Quick Test with Existing Data

If you want to test immediately without downloading:
1. Comment out all boundary layers in `frontend/layers.js` (already done)
2. Use only OSM base layer
3. Your weather data layers will still work
sudo -E ./import.sh ~/boundries/gadm41_NPL_shp/gadm41_NPL_1.shp province

sudo -E ./import.sh ~/boundries/gadm41_IND_shp/gadm41_IND_1.shp ind_adm1

sudo -E ./import.sh ~/boundries/gadm41_PAK_shp/gadm41_PAK_1.shp pak_adm1

sudo -E ./import.sh ~/boundries/gadm41_BGD_shp/gadm41_BGD_1.shp bgd_adm1

sudo -E ./import.sh ~/boundries/gadm41_CHN_shp/gadm41_CHN_1.shp chn_adm1

sudo -E ./import.sh ~/boundries/gadm41_BTN_shp/gadm41_BTN_1.shp btn_adm1

sudo -E ./import.sh ~/boundries/gadm41_LKA_shp/gadm41_LKA_1.shp lka_adm1

