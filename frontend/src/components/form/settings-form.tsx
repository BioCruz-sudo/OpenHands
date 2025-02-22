import {
  Autocomplete,
  AutocompleteItem,
  Input,
  Switch,
} from "@nextui-org/react";
import { useFetcher, useLocation, useNavigate } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import React from "react";
import { organizeModelsAndProviders } from "#/utils/organizeModelsAndProviders";
import { ModelSelector } from "#/components/modals/settings/ModelSelector";
import { Settings } from "#/services/settings";
import { ModalBackdrop } from "#/components/modals/modal-backdrop";
import { clientAction } from "#/routes/settings";
import { extractModelAndProvider } from "#/utils/extractModelAndProvider";
import ModalButton from "../buttons/ModalButton";
import { DangerModal } from "../modals/confirmation-modals/danger-modal";
import { I18nKey } from "#/i18n/declaration";

interface SettingsFormProps {
  disabled?: boolean;
  settings: Settings;
  models: string[];
  agents: string[];
  securityAnalyzers: string[];
  onClose: () => void;
}

export function SettingsForm({
  disabled,
  settings,
  models,
  agents,
  securityAnalyzers,
  onClose,
}: SettingsFormProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const fetcher = useFetcher<typeof clientAction>();
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    if (fetcher.data?.success) {
      navigate("/");
      onClose();
    }
  }, [fetcher.data, navigate, onClose]);

  const advancedAlreadyInUse = React.useMemo(() => {
    if (models.length > 0) {
      const organizedModels = organizeModelsAndProviders(models);
      const { provider, model } = extractModelAndProvider(
        settings.LLM_MODEL || "",
      );
      const isKnownModel =
        provider in organizedModels &&
        organizedModels[provider].models.includes(model);

      const isUsingSecurityAnalyzer = !!settings.SECURITY_ANALYZER;
      const isUsingConfirmationMode = !!settings.CONFIRMATION_MODE;
      const isUsingBaseUrl = !!settings.LLM_BASE_URL;
      const isUsingCustomModel = !!settings.LLM_MODEL && !isKnownModel;

      return (
        isUsingSecurityAnalyzer ||
        isUsingConfirmationMode ||
        isUsingBaseUrl ||
        isUsingCustomModel
      );
    }

    return false;
  }, [settings, models]);

  const [showAdvancedOptions, setShowAdvancedOptions] =
    React.useState(advancedAlreadyInUse);
  const [confirmResetDefaultsModalOpen, setConfirmResetDefaultsModalOpen] =
    React.useState(false);
  const [confirmEndSessionModalOpen, setConfirmEndSessionModalOpen] =
    React.useState(false);
  const [showWarningModal, setShowWarningModal] = React.useState(false);

  const submitForm = (formData: FormData) => {
    if (location.pathname === "/app") formData.set("end-session", "true");
    fetcher.submit(formData, { method: "POST", action: "/settings" });
  };

  const handleConfirmResetSettings = () => {
    const formData = new FormData(formRef.current ?? undefined);
    formData.set("intent", "reset");
    submitForm(formData);
  };

  const handleConfirmEndSession = () => {
    const formData = new FormData(formRef.current ?? undefined);
    submitForm(formData);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const apiKey = formData.get("api-key");

    if (!apiKey) {
      setShowWarningModal(true);
    } else if (location.pathname === "/app") {
      setConfirmEndSessionModalOpen(true);
    } else {
      submitForm(formData);
    }
  };

  const handleCloseClick = () => {
    const formData = new FormData(formRef.current ?? undefined);
    const apiKey = formData.get("api-key");

    if (!apiKey) {
      setShowWarningModal(true);
    } else {
      onClose();
    }
  };

  const handleWarningConfirm = () => {
    setShowWarningModal(false);
    const formData = new FormData(formRef.current ?? undefined);
    formData.set("api-key", ""); // Set null value for API key
    submitForm(formData);
    onClose();
  };

  const handleWarningCancel = () => {
    setShowWarningModal(false);
  };

  return (
    <div>
      <fetcher.Form
        ref={formRef}
        data-testid="settings-form"
        method="POST"
        action="/settings"
        className="flex flex-col gap-6"
        onSubmit={handleSubmit}
      >
        <div className="flex flex-col gap-2">
          <Switch
            isDisabled={disabled}
            name="use-advanced-options"
            isSelected={showAdvancedOptions}
            onValueChange={setShowAdvancedOptions}
            classNames={{
              thumb: clsx(
                "bg-[#5D5D5D] w-3 h-3 z-0",
                "group-data-[selected=true]:bg-white",
              ),
              wrapper: clsx(
                "border border-[#D4D4D4] bg-white px-[6px] w-12 h-6",
                "group-data-[selected=true]:border-transparent group-data-[selected=true]:bg-[#4465DB]",
              ),
              label: "text-[#A3A3A3] text-xs",
            }}
          >
            {t(I18nKey.SETTINGS_FORM$ADVANCED_OPTIONS_LABEL)}
          </Switch>

          {showAdvancedOptions && (
            <>
              <fieldset className="flex flex-col gap-2">
                <label
                  htmlFor="custom-model"
                  className="font-[500] text-[#A3A3A3] text-xs"
                >
                  {t(I18nKey.SETTINGS_FORM$CUSTOM_MODEL_LABEL)}
                </label>
                <Input
                  isDisabled={disabled}
                  id="custom-model"
                  name="custom-model"
                  defaultValue={settings.LLM_MODEL}
                  aria-label="Custom Model"
                  classNames={{
                    inputWrapper:
                      "bg-[#27272A] rounded-md text-sm px-3 py-[10px]",
                  }}
                />
              </fieldset>
              <fieldset className="flex flex-col gap-2">
                <label
                  htmlFor="base-url"
                  className="font-[500] text-[#A3A3A3] text-xs"
                >
                  {t(I18nKey.SETTINGS_FORM$BASE_URL_LABEL)}
                </label>
                <Input
                  isDisabled={disabled}
                  id="base-url"
                  name="base-url"
                  defaultValue={settings.LLM_BASE_URL}
                  aria-label="Base URL"
                  classNames={{
                    inputWrapper:
                      "bg-[#27272A] rounded-md text-sm px-3 py-[10px]",
                  }}
                />
              </fieldset>
            </>
          )}

          {!showAdvancedOptions && (
            <ModelSelector
              isDisabled={disabled}
              models={organizeModelsAndProviders(models)}
              currentModel={settings.LLM_MODEL}
            />
          )}

          <fieldset data-testid="api-key-input" className="flex flex-col gap-2">
            <label
              htmlFor="api-key"
              className="font-[500] text-[#A3A3A3] text-xs"
            >
              {t(I18nKey.SETTINGS_FORM$API_KEY_LABEL)}
            </label>
            <Input
              isDisabled={disabled}
              id="api-key"
              name="api-key"
              aria-label="API Key"
              type="password"
              defaultValue={settings.LLM_API_KEY}
              classNames={{
                inputWrapper: "bg-[#27272A] rounded-md text-sm px-3 py-[10px]",
              }}
            />
            <p className="text-sm text-[#A3A3A3]">
              {t(I18nKey.SETTINGS_FORM$DONT_KNOW_API_KEY_LABEL)}{" "}
              <a
                href="https://docs.all-hands.dev/modules/usage/llms"
                rel="noreferrer noopener"
                target="_blank"
                className="underline underline-offset-2"
              >
                {t(I18nKey.SETTINGS_FORM$CLICK_HERE_FOR_INSTRUCTIONS_LABEL)}
              </a>
            </p>
          </fieldset>

          {showAdvancedOptions && (
            <fieldset
              data-testid="agent-selector"
              className="flex flex-col gap-2"
            >
              <label
                htmlFor="agent"
                className="font-[500] text-[#A3A3A3] text-xs"
              >
                {t(I18nKey.SETTINGS_FORM$AGENT_LABEL)}
              </label>
              <Autocomplete
                isDisabled={disabled}
                isRequired
                id="agent"
                aria-label="Agent"
                data-testid="agent-input"
                name="agent"
                defaultSelectedKey={
                  fetcher.formData?.get("agent")?.toString() ?? settings.AGENT
                }
                isClearable={false}
                inputProps={{
                  classNames: {
                    inputWrapper:
                      "bg-[#27272A] rounded-md text-sm px-3 py-[10px]",
                  },
                }}
              >
                {agents.map((agent) => (
                  <AutocompleteItem key={agent} value={agent}>
                    {agent}
                  </AutocompleteItem>
                ))}
              </Autocomplete>
            </fieldset>
          )}

          {showAdvancedOptions && (
            <>
              <fieldset className="flex flex-col gap-2">
                <label
                  htmlFor="security-analyzer"
                  className="font-[500] text-[#A3A3A3] text-xs"
                >
                  {t(I18nKey.SETTINGS_FORM$SECURITY_ANALYZER_LABEL)}
                </label>
                <Autocomplete
                  isDisabled={disabled}
                  isRequired
                  id="security-analyzer"
                  name="security-analyzer"
                  aria-label="Security Analyzer"
                  defaultSelectedKey={
                    fetcher.formData?.get("security-analyzer")?.toString() ??
                    settings.SECURITY_ANALYZER
                  }
                  inputProps={{
                    classNames: {
                      inputWrapper:
                        "bg-[#27272A] rounded-md text-sm px-3 py-[10px]",
                    },
                  }}
                >
                  {securityAnalyzers.map((analyzer) => (
                    <AutocompleteItem key={analyzer} value={analyzer}>
                      {analyzer}
                    </AutocompleteItem>
                  ))}
                </Autocomplete>
              </fieldset>

              <Switch
                isDisabled={disabled}
                name="confirmation-mode"
                defaultSelected={settings.CONFIRMATION_MODE}
                classNames={{
                  thumb: clsx(
                    "bg-[#5D5D5D] w-3 h-3",
                    "group-data-[selected=true]:bg-white",
                  ),
                  wrapper: clsx(
                    "border border-[#D4D4D4] bg-white px-[6px] w-12 h-6",
                    "group-data-[selected=true]:border-transparent group-data-[selected=true]:bg-[#4465DB]",
                  ),
                  label: "text-[#A3A3A3] text-xs",
                }}
              >
                {t(I18nKey.SETTINGS_FORM$ENABLE_CONFIRMATION_MODE_LABEL)}
              </Switch>
            </>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <ModalButton
              disabled={disabled || fetcher.state === "submitting"}
              type="submit"
              text={t(I18nKey.SETTINGS_FORM$SAVE_LABEL)}
              className="bg-[#4465DB] w-full"
            />
            <ModalButton
              text={t(I18nKey.SETTINGS_FORM$CLOSE_LABEL)}
              className="bg-[#737373] w-full"
              onClick={handleCloseClick}
            />
          </div>
          <ModalButton
            disabled={disabled}
            text={t(I18nKey.SETTINGS_FORM$RESET_TO_DEFAULTS_LABEL)}
            variant="text-like"
            className="text-danger self-start"
            onClick={() => {
              setConfirmResetDefaultsModalOpen(true);
            }}
          />
        </div>
      </fetcher.Form>

      {confirmResetDefaultsModalOpen && (
        <ModalBackdrop>
          <DangerModal
            title={t(I18nKey.SETTINGS_FORM$ARE_YOU_SURE_LABEL)}
            description={t(
              I18nKey.SETTINGS_FORM$ALL_INFORMATION_WILL_BE_DELETED_MESSAGE,
            )}
            buttons={{
              danger: {
                text: t(I18nKey.SETTINGS_FORM$RESET_TO_DEFAULTS_LABEL),
                onClick: handleConfirmResetSettings,
              },
              cancel: {
                text: t(I18nKey.SETTINGS_FORM$CANCEL_LABEL),
                onClick: () => setConfirmResetDefaultsModalOpen(false),
              },
            }}
          />
        </ModalBackdrop>
      )}
      {confirmEndSessionModalOpen && (
        <ModalBackdrop>
          <DangerModal
            title={t(I18nKey.SETTINGS_FORM$END_SESSION_LABEL)}
            description={t(
              I18nKey.SETTINGS_FORM$CHANGING_WORKSPACE_WARNING_MESSAGE,
            )}
            buttons={{
              danger: {
                text: t(I18nKey.SETTINGS_FORM$END_SESSION_LABEL),
                onClick: handleConfirmEndSession,
              },
              cancel: {
                text: t(I18nKey.SETTINGS_FORM$CANCEL_LABEL),
                onClick: () => setConfirmEndSessionModalOpen(false),
              },
            }}
          />
        </ModalBackdrop>
      )}
      {showWarningModal && (
        <ModalBackdrop>
          <DangerModal
            title="Are you sure?"
            description="You haven't set an API key. Without an API key, you won't be able to use the AI features. Are you sure you want to close the settings?"
            buttons={{
              danger: {
                text: "Yes, close settings",
                onClick: handleWarningConfirm,
              },
              cancel: {
                text: "Cancel",
                onClick: handleWarningCancel,
              },
            }}
          />
        </ModalBackdrop>
      )}
    </div>
  );
}
