import { useAtom, useAtomValue } from "jotai";
import type React from "react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import { toast } from "sonner-native";
import { SaveAccountModal } from "@/components/SaveAccountModal";
import {
  pendingAccountSaveAtom,
  useJellyfin,
  userAtom,
} from "@/providers/JellyfinProvider";
import { writeErrorLog } from "@/utils/log";

/**
 * Post-login save-account prompt. Login flows (password or Quick Connect)
 * only flag the intent via pendingAccountSaveAtom; the protection picker
 * shows here, AFTER the session is authorized — the login screen itself
 * unmounts as soon as the user is set, so it can't host the modal.
 */
export const PendingAccountSaveModal: React.FC = () => {
  const [pending, setPending] = useAtom(pendingAccountSaveAtom);
  const user = useAtomValue(userAtom);
  const { saveCurrentAccount } = useJellyfin();
  const { t } = useTranslation();

  // A logout before answering drops the intent — it must not resurface on
  // the next (possibly different) login.
  useEffect(() => {
    if (!user && pending) setPending(null);
  }, [user, pending, setPending]);

  if (Platform.isTV) return null;

  return (
    <SaveAccountModal
      visible={!!pending && !!user}
      username={user?.Name ?? ""}
      onClose={() => setPending(null)}
      onSave={(securityType, pinCode) => {
        const serverName = pending?.serverName;
        setPending(null);
        saveCurrentAccount({ securityType, pinCode, serverName }).catch(
          (error) => {
            writeErrorLog(`Failed to save account: ${error?.message ?? error}`);
            toast.error(t("save_account.not_saved"));
          },
        );
      }}
    />
  );
};
