import {
  CLINICAL_AI_KIND_LABELS,
  type ClinicalAiKind,
  type ClinicalAiOutput,
  type ClinicalAiOwnerInstructions,
  type ClinicalAiPatientSummary,
  type ClinicalAiSoapAssist,
} from '@sincvete/shared';

function isSummary(kind: ClinicalAiKind, output: ClinicalAiOutput): output is ClinicalAiPatientSummary {
  return kind === 'patient_summary' && 'summary' in output;
}

function isSoap(kind: ClinicalAiKind, output: ClinicalAiOutput): output is ClinicalAiSoapAssist {
  return kind === 'soap_assist' && 'diagnosis' in output && 'treatment' in output;
}

function isInstructions(
  kind: ClinicalAiKind,
  output: ClinicalAiOutput
): output is ClinicalAiOwnerInstructions {
  return kind === 'owner_instructions' && 'body' in output;
}

interface ClinicalAiResultProps {
  kind: ClinicalAiKind;
  output: ClinicalAiOutput;
}

export function ClinicalAiResult({ kind, output }: ClinicalAiResultProps) {
  if (isSummary(kind, output)) {
    return (
      <div data-tour="ia-clinica-review" className="space-y-3 text-sm">
        <p>{output.summary}</p>
        {output.lastDiagnoses.length > 0 && (
          <ListBlock title="Diagnósticos recientes" items={output.lastDiagnoses} />
        )}
        {output.alerts.length > 0 && <ListBlock title="Alertas" items={output.alerts} />}
        {output.pending.length > 0 && <ListBlock title="Pendientes" items={output.pending} />}
      </div>
    );
  }

  if (isSoap(kind, output)) {
    return (
      <div className="space-y-3 text-sm">
        <FieldBlock title="Diagnóstico" value={output.diagnosis} />
        {output.differentials.length > 0 && (
          <ListBlock title="Diferenciales" items={output.differentials} />
        )}
        <FieldBlock title="Tratamiento" value={output.treatment} />
        <FieldBlock title="Plan" value={output.plan} />
      </div>
    );
  }

  if (isInstructions(kind, output)) {
    return (
      <div className="space-y-2 text-sm">
        <p className="font-medium">{output.title}</p>
        <p className="whitespace-pre-wrap text-muted-foreground">{output.body}</p>
      </div>
    );
  }

  return <p className="text-sm text-muted-foreground">{CLINICAL_AI_KIND_LABELS[kind]}</p>;
}

function FieldBlock({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <p className="font-medium">{title}</p>
      <p className="whitespace-pre-wrap text-muted-foreground">{value}</p>
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="font-medium">{title}</p>
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
