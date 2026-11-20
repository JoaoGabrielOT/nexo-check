import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorScreen } from './ErrorPages';

/** Última barreira, acima do roteador e do tema (ex.: o banco local não abre): evita a tela em branco. */
export class RootErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Erro no app', error, info.componentStack);
  }

  render() {
    return this.state.failed ? <ErrorScreen kind="error" /> : this.props.children;
  }
}
