'use client';
import React from 'react';
import { Button, ErrorState } from '@/components/ui';
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() { return this.state.error ? <div className="card"><ErrorState error={this.state.error} retry={() => this.setState({ error: null })} /><div className="pb-6 text-center"><Button variant="secondary" onClick={() => location.reload()}>Reload page</Button></div></div> : this.props.children; }
}
