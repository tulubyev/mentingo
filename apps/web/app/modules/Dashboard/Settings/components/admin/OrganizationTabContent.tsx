import { useIsYooKassaEnabled } from "~/api/queries/usePaymentsConfig";
import { useStripeConfigured } from "~/api/queries/useStripeConfigured";
import { AgeLimitSelect } from "~/modules/Dashboard/Settings/components/admin/AgeLimitSelect";
import { InviteOnlyRegistration } from "~/modules/Dashboard/Settings/components/admin/InviteOnlyRegistration";
import { LiveTrainingMaxParallelSessionsSetting } from "~/modules/Dashboard/Settings/components/admin/LiveTrainingMaxParallelSessionsSetting";
import { UploadFilesToLoginPage } from "~/modules/Dashboard/Settings/components/admin/UploadFilesToLoginPage";
import UserEmailTriggers from "~/modules/Dashboard/Settings/components/admin/UserEmailTriggers";

import SSOEnforceSwitch from "../SSOEnforceSwitch";

import { ConfigurationStatus } from "./ConfigurationStatus";
import { DefaultCourseCurrencySelect } from "./DefaultCourseCurrencySelect";
import RoleBasedMFAEnforcementSwitch from "./RoleBasedMFAEnforcementSwitch";

import type { GlobalSettings } from "../../types";

const isGoogleOAuthEnabled = import.meta.env.VITE_GOOGLE_OAUTH_ENABLED === "true";
const isMicrosoftOAuthEnabled = import.meta.env.VITE_MICROSOFT_OAUTH_ENABLED === "true";

interface OrganizationTabContentProps {
  globalSettings: GlobalSettings;
}

export default function OrganizationTabContent({ globalSettings }: OrganizationTabContentProps) {
  const { data: stripeConfigured } = useStripeConfigured();
  // With ЮKassa every course is priced in RUB, so there is no currency to choose.
  const isYooKassaEnabled = useIsYooKassaEnabled();
  const canEditSSOEnforcement = isGoogleOAuthEnabled || isMicrosoftOAuthEnabled;

  return (
    <>
      <ConfigurationStatus />
      {canEditSSOEnforcement && <SSOEnforceSwitch enforceSSO={globalSettings.enforceSSO} />}
      <UserEmailTriggers userEmailTriggers={globalSettings.userEmailTriggers} />
      <InviteOnlyRegistration inviteOnlyRegistration={globalSettings.inviteOnlyRegistration} />
      <LiveTrainingMaxParallelSessionsSetting
        value={globalSettings.liveTrainingMaxParallelSessions}
      />
      <RoleBasedMFAEnforcementSwitch MFAEnforcedRoles={globalSettings.MFAEnforcedRoles} />
      {stripeConfigured?.enabled && !isYooKassaEnabled && (
        <DefaultCourseCurrencySelect currentCurrency={globalSettings.defaultCourseCurrency} />
      )}
      <AgeLimitSelect limit={globalSettings.ageLimit} />
      <UploadFilesToLoginPage />
    </>
  );
}
