import * as React from "react"
import { Info } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { OrderStatusBadge, PaymentStatusBadge, PriorityBadge } from "@/components/status-badges"
import { derivePaymentStatus, formatCurrency, formatDate, orderAmountPaid, orderBalanceDue, orderTotal } from "@/lib/helpers"
import { supabase } from "@/lib/supabase"
import type { Customer, Order, OrderAdditionalCost, OrderItem, Payment, UserProfile } from "@/lib/types"

// An (i) button beside a field that points at another record. It opens a small
// card with that record's key details, so a person can confirm they picked the
// right customer, order or colleague without leaving the form.

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === "") return null
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right text-sm break-words">{children}</span>
    </div>
  )
}

function InfoButton({ label, disabled, children }: { label: string; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={label}
          title={disabled ? "Choose one first to see its details" : label}
          disabled={disabled}
        >
          <Info className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 max-w-[calc(100vw-2rem)] p-3">
        <div className="flex flex-col gap-2">{children}</div>
      </PopoverContent>
    </Popover>
  )
}

export function CustomerInfoButton({ customer }: { customer: Customer | null | undefined }) {
  return (
    <InfoButton label="Customer details" disabled={!customer}>
      {customer && (
        <>
          <div className="text-sm font-semibold">{customer.customer_business_name}</div>
          <Row label="Code">{customer.customer_code}</Row>
          <Row label="Type">{customer.customer_type}</Row>
          <Row label="Contact">{customer.contact_person}</Row>
          <Row label="Phone">{customer.phone}</Row>
          <Row label="WhatsApp">{customer.whatsapp}</Row>
          <Row label="Email">{customer.email}</Row>
          <Row label="Billing address">{customer.billing_address}</Row>
          <Row label="Delivery address">{customer.delivery_address}</Row>
          <Row label="GST">{customer.gst_tax_number}</Row>
          <Row label="Notes">{customer.notes}</Row>
        </>
      )}
    </InfoButton>
  )
}

export function UserInfoButton({ user }: { user: UserProfile | null | undefined }) {
  return (
    <InfoButton label="Person's details" disabled={!user}>
      {user && (
        <>
          <div className="text-sm font-semibold">{user.display_name}</div>
          <Row label="Role">{user.role}</Row>
          <Row label="Phone">{user.phone}</Row>
          <Row label="Email">{user.email}</Row>
        </>
      )}
    </InfoButton>
  )
}

interface OrderSnapshot {
  order: Order
  customer: Customer | null
  items: OrderItem[]
  payments: Payment[]
  costs: OrderAdditionalCost[]
}

function OrderDetails({ orderId }: { orderId: string }) {
  const [snap, setSnap] = React.useState<OrderSnapshot | null>(null)
  const [missing, setMissing] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: order } = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle()
      if (!order) {
        if (!cancelled) setMissing(true)
        return
      }
      const [cust, items, pays, costs] = await Promise.all([
        supabase.from("customers").select("*").eq("id", order.customer_id).maybeSingle(),
        supabase.from("order_items").select("*").eq("order_id", orderId),
        supabase.from("payments").select("*").eq("order_id", orderId),
        supabase.from("order_additional_costs").select("*").eq("order_id", orderId),
      ])
      if (!cancelled) {
        setSnap({
          order: order as Order,
          customer: (cust.data as Customer | null) ?? null,
          items: (items.data || []) as OrderItem[],
          payments: (pays.data || []) as Payment[],
          costs: (costs.data || []) as OrderAdditionalCost[],
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [orderId])

  if (missing) return <span className="text-sm text-muted-foreground">This order couldn't be found.</span>
  if (!snap) return <span className="text-sm text-muted-foreground">Loading…</span>
  const { order, customer, items, payments, costs } = snap
  const total = orderTotal(items, costs, order)
  return (
    <>
      <div className="text-sm font-semibold">Order {order.order_number}</div>
      <Row label="Customer">{customer?.customer_business_name}</Row>
      <Row label="Phone">{customer?.phone}</Row>
      <Row label="Status">
        <OrderStatusBadge status={order.order_status} />
      </Row>
      <Row label="Priority">
        <PriorityBadge priority={order.priority} />
      </Row>
      <Row label="Order date">{formatDate(order.order_date)}</Row>
      <Row label="Delivery date">{order.required_date ? formatDate(order.required_date) : ""}</Row>
      <Row label="Items">{items.length}</Row>
      <Row label="Total">{formatCurrency(total)}</Row>
      <Row label="Paid">{formatCurrency(orderAmountPaid(payments))}</Row>
      <Row label="Balance">{formatCurrency(orderBalanceDue(items, payments, costs, order))}</Row>
      <Row label="Payment">
        <PaymentStatusBadge status={derivePaymentStatus(items, payments, costs, order)} />
      </Row>
    </>
  )
}

export function OrderInfoButton({ orderId }: { orderId: string | null | undefined }) {
  return (
    <InfoButton label="Order details" disabled={!orderId}>
      {orderId && <OrderDetails orderId={orderId} />}
    </InfoButton>
  )
}
