import { useI18n } from "../../i18n";
import type { ConditionalLogicCondition, ConditionalLogicGroup, ConditionalLogicOperator, FormField } from "../../types";
import { wouldCreateConditionalCycle } from "../../utils/formLogic";

interface AdvancedSettingsProps {
  field: FormField;
  fields: FormField[];
  onChange: (field: FormField) => void;
}

const operatorOptions: Array<{ value: ConditionalLogicOperator; label: string; needsValue: boolean }> = [
  { value: "equals", label: "Equals", needsValue: true },
  { value: "notEquals", label: "Does not equal", needsValue: true },
  { value: "contains", label: "Contains", needsValue: true },
  { value: "greaterThan", label: "Greater than", needsValue: true },
  { value: "lessThan", label: "Less than", needsValue: true },
  { value: "isEmpty", label: "Is empty", needsValue: false },
  { value: "isNotEmpty", label: "Is not empty", needsValue: false },
];

function createDefaultCondition(fieldId = ""): ConditionalLogicCondition {
  return {
    fieldId,
    operator: "equals",
    value: "",
  };
}

function updateLogicGroup(
  group: ConditionalLogicGroup | undefined,
  patch: Partial<ConditionalLogicGroup>,
): ConditionalLogicGroup | undefined {
  if (!group && !patch.conditions?.length) {
    return undefined;
  }
  const next = {
    logic: patch.logic ?? group?.logic ?? "all",
    conditions: patch.conditions ?? group?.conditions ?? [],
  } satisfies ConditionalLogicGroup;
  return next.conditions.length ? next : undefined;
}

function ConditionalLogicEditor({
  title,
  summary,
  emptyLabel,
  ruleGroup,
  field,
  fields,
  onChange,
}: {
  title: string;
  summary: string;
  emptyLabel: string;
  ruleGroup: ConditionalLogicGroup | undefined;
  field: FormField;
  fields: FormField[];
  onChange: (group: ConditionalLogicGroup | undefined) => void;
}) {
  const availableFields = fields.filter((candidate) => candidate.id !== field.id);

  function findFirstValidTarget() {
    return (
      availableFields.find((candidate) => !wouldCreateConditionalCycle(fields, field.id, candidate.id))?.id ?? ""
    );
  }

  function updateCondition(index: number, patch: Partial<ConditionalLogicCondition>) {
    const conditions = (ruleGroup?.conditions ?? []).map((condition, conditionIndex) => {
      if (conditionIndex !== index) {
        return condition;
      }
      return { ...condition, ...patch };
    });
    onChange(updateLogicGroup(ruleGroup, { conditions }));
  }

  function removeCondition(index: number) {
    const conditions = (ruleGroup?.conditions ?? []).filter((_, conditionIndex) => conditionIndex !== index);
    onChange(updateLogicGroup(ruleGroup, { conditions }));
  }

  function addCondition() {
    const conditions = [...(ruleGroup?.conditions ?? []), createDefaultCondition(findFirstValidTarget())];
    onChange(updateLogicGroup(ruleGroup, { conditions }));
  }

  return (
    <details className="composer-logic-editor">
      <summary>{title}</summary>
      <div className="composer-logic-stack">
        <p className="muted">{summary}</p>

        {ruleGroup?.conditions.length ? (
          <>
            <label className="composer-logic-mode">
              <span>{summary}</span>
              <select
                value={ruleGroup.logic}
                onChange={(event) => onChange(updateLogicGroup(ruleGroup, { logic: event.target.value as ConditionalLogicGroup["logic"] }))}
              >
                <option value="all">All conditions</option>
                <option value="any">Any condition</option>
              </select>
            </label>

            <div className="composer-logic-conditions">
              {ruleGroup.conditions.map((condition, index) => {
                const operatorMeta = operatorOptions.find((option) => option.value === condition.operator) ?? operatorOptions[0];
                return (
                  <div key={`${field.id}-logic-${index}`} className="composer-logic-condition">
                    <label>
                      <span>Field</span>
                      <select
                        value={condition.fieldId}
                        onChange={(event) => updateCondition(index, { fieldId: event.target.value })}
                      >
                        <option value="">{emptyLabel}</option>
                        {availableFields.map((candidate) => {
                          const blocked = wouldCreateConditionalCycle(fields, field.id, candidate.id);
                          return (
                            <option key={candidate.id} value={candidate.id} disabled={blocked}>
                              {candidate.label.trim() || candidate.id}
                            </option>
                          );
                        })}
                      </select>
                    </label>

                    <label>
                      <span>Operator</span>
                      <select
                        value={condition.operator}
                        onChange={(event) => updateCondition(index, { operator: event.target.value as ConditionalLogicOperator })}
                      >
                        {operatorOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    {operatorMeta.needsValue ? (
                      <label>
                        <span>Value</span>
                        <input
                          value={condition.value ?? ""}
                          onChange={(event) => updateCondition(index, { value: event.target.value })}
                          placeholder="Value"
                        />
                      </label>
                    ) : (
                      <div className="composer-logic-condition-note">
                        <span>Value</span>
                        <small className="muted">No value needed for this operator.</small>
                      </div>
                    )}

                    <button type="button" className="danger-button" onClick={() => removeCondition(index)}>
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <p className="muted">{emptyLabel}</p>
        )}

        <button
          type="button"
          className="ghost-button"
          onClick={addCondition}
          disabled={!findFirstValidTarget() && availableFields.length > 0 && !(ruleGroup?.conditions.length)}
        >
          + Add condition
        </button>

        {!availableFields.length ? (
          <p className="muted">Add another field first to reference it here.</p>
        ) : null}
      </div>
    </details>
  );
}

export function AdvancedSettings({ field, fields, onChange }: AdvancedSettingsProps) {
  const { t } = useI18n();

  function update<K extends keyof FormField>(key: K, value: FormField[K]) {
    onChange({ ...field, [key]: value });
  }

  return (
    <details className="question-advanced">
      <summary>{t("advanced")}</summary>
      <div className="composer-advanced-stack">
        <section className="composer-advanced-group">
          <strong>{t("responseSettings")}</strong>
          <div className="toggle-row">
            <label className="toggle">
              <input
                type="checkbox"
                checked={field.required}
                onChange={(event) => update("required", event.target.checked)}
              />
              <span>{t("required")}</span>
            </label>
          </div>

          <label>
            <span>{t("placeholder")}</span>
            <input
              value={field.placeholder ?? ""}
              onChange={(event) => update("placeholder", event.target.value)}
              placeholder={t("placeholderExample")}
            />
          </label>

          <label>
            <span>{t("helpText")}</span>
            <input
              value={field.helpText ?? ""}
              onChange={(event) => update("helpText", event.target.value)}
              placeholder={t("helpTextExample")}
            />
          </label>

          <label>
            <span>{t("validation")}</span>
            <input
              value={field.validationHint ?? ""}
              onChange={(event) => update("validationHint", event.target.value)}
              placeholder={t("validationPlaceholder")}
            />
          </label>

          <ConditionalLogicEditor
            title={t("conditionalLogic")}
            summary={t("showThisFieldWhen")}
            emptyLabel={t("conditionalLogicEmpty")}
            ruleGroup={field.visibilityRules}
            field={field}
            fields={fields}
            onChange={(group) => update("visibilityRules", group)}
          />

          <ConditionalLogicEditor
            title={t("conditionalRequired")}
            summary={t("requireThisFieldWhen")}
            emptyLabel={t("conditionalRequiredEmpty")}
            ruleGroup={field.requiredRules}
            field={field}
            fields={fields}
            onChange={(group) => update("requiredRules", group)}
          />
        </section>

        <section className="composer-advanced-group">
          <strong>{t("privacySettings")}</strong>
          <div className="toggle-row">
            <label className="toggle">
              <input
                type="checkbox"
                checked={field.sensitive}
                onChange={(event) => update("sensitive", event.target.checked)}
              />
              <span>{t("sensitive")}</span>
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={Boolean(field.adminOnly)}
                onChange={(event) => update("adminOnly", event.target.checked)}
              />
              <span>{t("adminOnly")}</span>
            </label>
          </div>

          <label>
            <span>{t("visibility")}</span>
            <select
              value={field.visibility ?? "public"}
              onChange={(event) => update("visibility", event.target.value as FormField["visibility"])}
            >
              <option value="public">{t("visibleToEveryone")}</option>
              <option value="admin">{t("visibleToAdmin")}</option>
            </select>
          </label>
        </section>
      </div>
    </details>
  );
}
