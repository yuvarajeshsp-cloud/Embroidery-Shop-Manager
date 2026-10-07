-- In-app account deletion (required by Google Play / App Store for apps with
-- sign-up). Called only by the delete-account edge function with the service
-- role — never by a signed-in user directly — after it has checked who is
-- allowed to delete what.
--
-- Two cases:
--  * p_delete_org = false: the person leaves a shop that keeps running. Every
--    "created by / assigned to / uploaded by" pointer to them is cleared so
--    the shop's orders, customers and payments stay intact, and their name is
--    scrubbed from audit entries. (Their profile row goes when the auth user
--    is deleted, via ON DELETE CASCADE.)
--  * p_delete_org = true: they are the shop's only member, so the whole shop
--    and all its data is deleted. Returns the storage paths of its uploaded
--    attachments so the caller can delete those files too.
CREATE OR REPLACE FUNCTION purge_account(p_user uuid, p_delete_org boolean)
RETURNS text[] AS $$
DECLARE
  v_org uuid;
  v_paths text[] := '{}';
BEGIN
  SELECT organization_id INTO v_org FROM user_profiles WHERE id = p_user;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'No such account';
  END IF;

  IF p_delete_org THEN
    IF (SELECT count(*) FROM user_profiles WHERE organization_id = v_org) <> 1 THEN
      RAISE EXCEPTION 'Organization still has other members';
    END IF;

    SELECT COALESCE(array_agg(file_path), '{}') INTO v_paths
    FROM order_item_attachments WHERE organization_id = v_org;

    DELETE FROM order_item_attachments WHERE organization_id = v_org;
    DELETE FROM payments WHERE organization_id = v_org;
    DELETE FROM expenses WHERE organization_id = v_org;
    DELETE FROM order_items WHERE organization_id = v_org;
    DELETE FROM orders WHERE organization_id = v_org;
    DELETE FROM customers WHERE organization_id = v_org;
    DELETE FROM whatsapp_message_log WHERE organization_id = v_org;
    DELETE FROM whatsapp_templates WHERE organization_id = v_org;
    DELETE FROM config_stitch_rates WHERE organization_id = v_org;
    DELETE FROM config_items WHERE organization_id = v_org;
    DELETE FROM business_settings WHERE organization_id = v_org;
    DELETE FROM audit_logs WHERE organization_id = v_org;
    DELETE FROM user_profiles WHERE id = p_user;
    DELETE FROM organizations WHERE id = v_org;
  ELSE
    UPDATE customers SET created_by = NULL WHERE created_by = p_user;
    UPDATE customers SET updated_by = NULL WHERE updated_by = p_user;
    UPDATE orders SET created_by = NULL WHERE created_by = p_user;
    UPDATE orders SET updated_by = NULL WHERE updated_by = p_user;
    UPDATE orders SET assigned_to = NULL WHERE assigned_to = p_user;
    UPDATE payments SET created_by = NULL WHERE created_by = p_user;
    UPDATE payments SET updated_by = NULL WHERE updated_by = p_user;
    UPDATE order_item_attachments SET uploaded_by = NULL WHERE uploaded_by = p_user;
    UPDATE whatsapp_message_log SET sent_by = NULL WHERE sent_by = p_user;
    UPDATE audit_logs SET user_id = NULL, user_name = 'Deleted user' WHERE user_id = p_user;
  END IF;

  RETURN v_paths;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION purge_account(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION purge_account(uuid, boolean) TO service_role;
