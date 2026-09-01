export type UserRole = "Administrator" | "Manager" | "Operator" | "Accounts"

export interface UserProfile {
  id: string
  display_name: string
  email: string
  phone: string | null
  role: UserRole
  avatar_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Customer {
  id: string
  customer_code: string
  customer_business_name: string
  contact_person: string | null
  phone: string | null
  whatsapp: string | null
  email: string | null
  billing_address: string | null
  delivery_address: string | null
  customer_type: string
  gst_tax_number: string | null
  date_added: string
  notes: string | null
  is_active: boolean
  archived: boolean
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export interface Order {
  id: string
  order_number: string
  order_date: string
  customer_id: string
  required_date: string | null
  priority: string
  order_status: string
  actual_delivery_date: string | null
  customer_po_reference: string | null
  sales_channel: string | null
  special_instructions: string | null
  internal_notes: string | null
  archived: boolean
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export interface OrderItem {
  id: string
  order_id: string
  item_number: number
  product_type: string
  product_description: string | null
  design_name_number: string | null
  size_placement: string | null
  quantity: number
  stitches_per_unit: number
  rate_per_1000_stitches: number
  manual_unit_price: number | null
  setup_digitizing_charge: number
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Payment {
  id: string
  payment_number: string
  payment_date: string
  order_id: string
  customer_id: string
  payment_method: string
  amount: number
  transaction_reference: string | null
  notes: string | null
  payment_status: string
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export interface ProductionRecord {
  id: string
  order_id: string
  assigned_operator: string
  overall_stage: string
  design_received_date: string | null
  digitizing_status: string
  digitizing_date: string | null
  sampling_status: string
  sample_approval_date: string | null
  production_status: string
  production_start_date: string | null
  production_complete_date: string | null
  qc_status: string
  packing_status: string
  delivery_status: string
  remarks: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  updated_by: string | null
}

export interface ProductionStageHistory {
  id: string
  production_id: string
  field_name: string
  previous_value: string | null
  new_value: string | null
  changed_by: string | null
  changed_at: string
  reason: string | null
}

export interface AuditLog {
  id: string
  user_id: string | null
  user_name: string | null
  table_name: string
  record_id: string
  action: string
  previous_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  reason: string | null
  changed_at: string
}

export interface ConfigItem {
  id: string
  category: string
  name: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ConfigStitchRate {
  id: string
  embroidery_type: string
  rate_per_1000_stitches: number
  min_stitches: number | null
  max_stitches: number | null
  effective_from: string
  effective_to: string | null
  notes: string | null
  created_at: string
}

export interface BusinessSetting {
  id: string
  key: string
  value: string
  updated_at: string
}

export interface OrderWithCustomer extends Order {
  customer?: Customer
}

export interface OrderWithDetails extends Order {
  customer?: Customer
  order_items?: OrderItem[]
  payments?: Payment[]
  production_records?: ProductionRecord[]
}

export interface PaymentWithRelations extends Payment {
  order?: Order
  customer?: Customer
}
