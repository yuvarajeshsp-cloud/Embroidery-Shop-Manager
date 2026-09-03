import * as React from "react"
import { Plus, Trash2, Send, MessageCircle, Info } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/use-auth"
import {
  WHATSAPP_CONFIG_KEYS,
  fetchWhatsAppConfig,
  fetchWhatsAppTemplates,
  sendWhatsAppTestMessage,
} from "@/lib/whatsapp"
import { saveBusinessSettings } from "@/lib/config"
import { formatDateTime } from "@/lib/helpers"
import type { WhatsAppTemplate, WhatsAppTemplateCategory, WhatsAppMessageLog } from "@/lib/types"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"

const CATEGORIES: WhatsAppTemplateCategory[] = ["utility", "marketing", "authentication"]

export function WhatsAppPage() {
  const { profile } = useAuth()
  const [loading, setLoading] = React.useState(true)
  const [templates, setTemplates] = React.useState<WhatsAppTemplate[]>([])
  const [logs, setLogs] = React.useState<WhatsAppMessageLog[]>([])
  const [showAddTemplate, setShowAddTemplate] = React.useState(false)

  const [config, setConfig] = React.useState({
    phoneNumberId: "",
    businessAccountId: "",
    apiVersion: "v20.0",
    statusTemplateName: "",
    statusTemplateLanguage: "en",
    documentShareTemplateName: "",
    documentShareTemplateLanguage: "en",
    imageShareTemplateName: "",
    imageShareTemplateLanguage: "en",
  })
  const [savingConfig, setSavingConfig] = React.useState(false)

  const [testPhone, setTestPhone] = React.useState("")
  const [testTemplate, setTestTemplate] = React.useState("")
  const [sendingTest, setSendingTest] = React.useState(false)

  React.useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    const [cfg, tpl] = await Promise.all([fetchWhatsAppConfig(), fetchWhatsAppTemplates()])
    setConfig(cfg)
    setTemplates(tpl)
    const { data: logData } = await supabase
      .from("whatsapp_message_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20)
    setLogs(logData || [])
    setLoading(false)
  }

  async function handleSaveConfig() {
    setSavingConfig(true)
    try {
      await saveBusinessSettings({
        [WHATSAPP_CONFIG_KEYS.phoneNumberId]: config.phoneNumberId,
        [WHATSAPP_CONFIG_KEYS.businessAccountId]: config.businessAccountId,
        [WHATSAPP_CONFIG_KEYS.apiVersion]: config.apiVersion,
        [WHATSAPP_CONFIG_KEYS.statusTemplateName]: config.statusTemplateName,
        [WHATSAPP_CONFIG_KEYS.statusTemplateLanguage]: config.statusTemplateLanguage,
        [WHATSAPP_CONFIG_KEYS.documentShareTemplateName]: config.documentShareTemplateName,
        [WHATSAPP_CONFIG_KEYS.documentShareTemplateLanguage]: config.documentShareTemplateLanguage,
        [WHATSAPP_CONFIG_KEYS.imageShareTemplateName]: config.imageShareTemplateName,
        [WHATSAPP_CONFIG_KEYS.imageShareTemplateLanguage]: config.imageShareTemplateLanguage,
      })
      toast.success("WhatsApp configuration saved")
    } catch (err) {
      console.error(err)
      toast.error("Failed to save configuration")
    } finally {
      setSavingConfig(false)
    }
  }

  async function handleToggleTemplateActive(t: WhatsAppTemplate) {
    const { error } = await supabase
      .from("whatsapp_templates")
      .update({ is_active: !t.is_active, updated_at: new Date().toISOString() })
      .eq("id", t.id)
    if (error) {
      toast.error("Failed to update template")
    } else {
      loadAll()
    }
  }

  async function handleDeleteTemplate(t: WhatsAppTemplate) {
    if (!confirm(`Remove template "${t.name}" from the list?`)) return
    const { error } = await supabase.from("whatsapp_templates").delete().eq("id", t.id)
    if (error) {
      toast.error("Failed to remove template")
    } else {
      toast.success("Template removed")
      loadAll()
    }
  }

  async function handleSendTest() {
    if (!testPhone.trim() || !testTemplate) {
      toast.error("Enter a phone number and choose a template")
      return
    }
    setSendingTest(true)
    try {
      const template = templates.find((t) => t.name === testTemplate)
      const result = await sendWhatsAppTestMessage(testPhone.trim(), testTemplate, template?.language || "en", profile?.id)
      if (result.success) {
        toast.success("Test message sent")
      } else {
        toast.error(result.error || "Failed to send test message")
      }
      loadAll()
    } finally {
      setSendingTest(false)
    }
  }

  if (loading) {
    return <div className="flex flex-1 items-center justify-center p-8 text-muted-foreground">Loading...</div>
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <PageHeader title="WhatsApp" description="Configure WhatsApp Business messaging and templates" />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="size-4" /> Configuration
          </CardTitle>
          <CardDescription>Non-secret settings for the WhatsApp Cloud API connection</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label>Phone Number ID</Label>
              <Input
                value={config.phoneNumberId}
                onChange={(e) => setConfig({ ...config, phoneNumberId: e.target.value })}
                placeholder="e.g. 123456789012345"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>WhatsApp Business Account ID</Label>
              <Input
                value={config.businessAccountId}
                onChange={(e) => setConfig({ ...config, businessAccountId: e.target.value })}
                placeholder="e.g. 987654321098765"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Graph API Version</Label>
              <Input
                value={config.apiVersion}
                onChange={(e) => setConfig({ ...config, apiVersion: e.target.value })}
                placeholder="v20.0"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Order Status Update Template</Label>
              <Select value={config.statusTemplateName || undefined} onValueChange={(v) => setConfig({ ...config, statusTemplateName: v })}>
                <SelectTrigger><SelectValue placeholder="Select a template..." /></SelectTrigger>
                <SelectContent>
                  {templates.filter((t) => t.is_active).map((t) => (
                    <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Document Share Template (optional)</Label>
              <Select value={config.documentShareTemplateName || undefined} onValueChange={(v) => setConfig({ ...config, documentShareTemplateName: v })}>
                <SelectTrigger><SelectValue placeholder="None — send as plain document" /></SelectTrigger>
                <SelectContent>
                  {templates.filter((t) => t.is_active).map((t) => (
                    <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Image Share Template (optional)</Label>
              <Select value={config.imageShareTemplateName || undefined} onValueChange={(v) => setConfig({ ...config, imageShareTemplateName: v })}>
                <SelectTrigger><SelectValue placeholder="None — send as plain image" /></SelectTrigger>
                <SelectContent>
                  {templates.filter((t) => t.is_active).map((t) => (
                    <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Document/Image Share templates need a matching header (type Document or Image) approved in Meta
              Business Manager. When set, invoices and shared files try the template first — this works even if
              the customer hasn't messaged you recently — and automatically fall back to a plain document/image
              message (which only delivers within an active 24-hour conversation) if the template isn't
              configured or fails.
            </span>
          </div>

          <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>
              The API access token is not stored here — it never touches the database or the app's code, since
              that would expose it to anyone with browser access. Set it directly as a Supabase Edge Function
              secret from your own terminal:
              <code className="mt-1 block rounded bg-background px-2 py-1 font-mono">
                supabase secrets set WHATSAPP_ACCESS_TOKEN=your_token_here
              </code>
            </span>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSaveConfig} disabled={savingConfig}>
              {savingConfig ? "Saving..." : "Save Configuration"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Message Templates</CardTitle>
            <CardDescription>Register the exact names of templates already approved in Meta Business Manager</CardDescription>
          </div>
          <Button size="sm" onClick={() => setShowAddTemplate(true)}>
            <Plus className="size-4" /> Add Template
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {templates.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No templates registered yet</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Language</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs font-medium">{t.name}</TableCell>
                    <TableCell><Badge variant="outline">{t.category}</Badge></TableCell>
                    <TableCell className="text-sm">{t.language}</TableCell>
                    <TableCell className="max-w-[240px] text-sm text-muted-foreground">{t.description || "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch checked={t.is_active} onCheckedChange={() => handleToggleTemplateActive(t)} />
                        <span className="text-xs text-muted-foreground">{t.is_active ? "Active" : "Inactive"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon-sm" onClick={() => handleDeleteTemplate(t)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Send Test Message</CardTitle>
          <CardDescription>Verify your configuration by sending a template message to any number</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-2">
            <Label className="text-xs">Phone Number</Label>
            <Input
              className="w-[200px]"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="+91XXXXXXXXXX"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label className="text-xs">Template</Label>
            <Select value={testTemplate || undefined} onValueChange={setTestTemplate}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Select a template..." /></SelectTrigger>
              <SelectContent>
                {templates.filter((t) => t.is_active).map((t) => (
                  <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleSendTest} disabled={sendingTest}>
            <Send className="size-4" /> {sendingTest ? "Sending..." : "Send Test"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Messages</CardTitle>
          <CardDescription>Last 20 messages sent by the app</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No messages sent yet</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sent</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs">{formatDateTime(l.created_at)}</TableCell>
                    <TableCell className="font-mono text-xs">{l.recipient_phone}</TableCell>
                    <TableCell className="text-sm">{l.message_kind}</TableCell>
                    <TableCell className="text-sm">{l.template_name || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={l.status === "sent" ? "default" : l.status === "failed" ? "destructive" : "outline"}>
                        {l.status}
                      </Badge>
                      {l.status === "failed" && l.error_message && (
                        <div className="mt-1 max-w-[300px] text-xs text-destructive">{l.error_message}</div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {showAddTemplate && (
        <AddTemplateDialog onClose={() => setShowAddTemplate(false)} onSaved={() => { setShowAddTemplate(false); loadAll() }} />
      )}
    </div>
  )
}

function AddTemplateDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = React.useState(false)
  const [form, setForm] = React.useState({
    name: "",
    category: "utility" as WhatsAppTemplateCategory,
    language: "en",
    description: "",
    variable_count: 0,
  })

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("Template name is required")
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.from("whatsapp_templates").insert({
        name: form.name.trim(),
        category: form.category,
        language: form.language.trim() || "en",
        description: form.description || null,
        variable_count: form.variable_count || 0,
      })
      if (error) {
        if (error.code === "23505") {
          toast.error("A template with this name already exists")
        } else {
          throw error
        }
        return
      }
      toast.success("Template added")
      onSaved()
    } catch (err) {
      console.error(err)
      toast.error("Failed to add template")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add WhatsApp Template</DialogTitle>
          <DialogDescription>
            Enter the exact name of a template already approved in Meta Business Manager
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label>Template Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. order_status_update"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as WhatsAppTemplateCategory })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Language Code</Label>
              <Input value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} placeholder="en" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Description</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What this template is used for"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Add"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
