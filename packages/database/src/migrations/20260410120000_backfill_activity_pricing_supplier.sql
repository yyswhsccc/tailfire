-- Stage 1: Package parents — use package_details.supplier_name
UPDATE activity_pricing ap
SET supplier = pd.supplier_name, updated_at = now()
FROM package_details pd
WHERE pd.activity_id = ap.activity_id
  AND ap.supplier IS NULL
  AND NULLIF(TRIM(pd.supplier_name), '') IS NOT NULL;

-- Stage 2: Cruise activities — use custom_cruise_details.cruise_line_name
UPDATE activity_pricing ap
SET supplier = ccd.cruise_line_name, updated_at = now()
FROM custom_cruise_details ccd
WHERE ccd.activity_id = ap.activity_id
  AND ap.supplier IS NULL
  AND NULLIF(TRIM(ccd.cruise_line_name), '') IS NOT NULL;

-- Stage 3: OCR-imported activities — extract from ocr_import_jobs extraction JSON
UPDATE activity_pricing ap
SET supplier = src.supplier_name, updated_at = now()
FROM (
  SELECT oj.activity_id,
    NULLIF(TRIM(COALESCE(
      oj.extraction_result->'package'->>'supplierName',
      oj.extraction_result->'cruise'->>'cruiseLineName',
      oj.extraction_result->'transportation'->>'companyName',
      oj.extraction_result->'dining'->>'restaurantName',
      oj.extraction_result->'lodging'->>'propertyName',
      oj.extraction_result->'flight'->>'airline'
    )), '') AS supplier_name
  FROM ocr_import_jobs oj
  WHERE oj.activity_id IS NOT NULL AND oj.status = 'confirmed'
) src
WHERE src.activity_id = ap.activity_id
  AND ap.supplier IS NULL
  AND src.supplier_name IS NOT NULL;

-- Stage 4: TES imports — use traveler_bookings.supplier when unanimous
UPDATE activity_pricing ap
SET supplier = tb.supplier_name, updated_at = now()
FROM (
  SELECT activity_id,
    CASE WHEN COUNT(DISTINCT NULLIF(TRIM(supplier), '')) = 1
      THEN MAX(NULLIF(TRIM(supplier), ''))
      ELSE NULL
    END AS supplier_name
  FROM traveler_bookings
  GROUP BY activity_id
) tb
WHERE tb.activity_id = ap.activity_id
  AND ap.supplier IS NULL
  AND tb.supplier_name IS NOT NULL;
