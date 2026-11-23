'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, buildSchema, Field, FieldDef } from '.';

/** Inline (non-dialog) variant of FormDialog, used where a dialog already wraps the form. */
export function FormBody({ fields, onSubmit, loading, onCancel, submitLabel = 'Confirm' }: { fields: FieldDef[]; onSubmit: (v: any) => Promise<any>; loading?: boolean; onCancel: () => void; submitLabel?: string }) {
  const form = useForm<any>({ resolver: zodResolver(buildSchema(fields)), defaultValues: Object.fromEntries(fields.map(f => [f.name, f.initial ?? ''])) }); const errs = form.formState.errors as Record<string, any>;
  return <form noValidate onSubmit={form.handleSubmit(v => onSubmit(v))} className="space-y-3">{fields.map(f => <Field key={f.name} f={f} form={form} err={errs[f.name]?.message} />)}
    <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button><Button type="submit" loading={loading}>{submitLabel}</Button></div></form>;
}
