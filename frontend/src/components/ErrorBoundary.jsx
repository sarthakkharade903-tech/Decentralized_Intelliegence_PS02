import React from 'react';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Workstation Error Caught by Boundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#06080D] text-slate-100 flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-xl w-full p-8 rounded-2xl bg-[#080D19] border border-rose-500/30 shadow-[0_0_30px_-5px_rgba(244,63,94,0.2)] space-y-5">
            <div className="w-14 h-14 mx-auto rounded-full bg-rose-950/60 border border-rose-800 flex items-center justify-center text-rose-400">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div className="space-y-1">
              <h2 className="text-xl font-bold font-mono text-white">Workstation Render Encountered An Issue</h2>
              <p className="text-xs text-slate-400">
                A client-side runtime exception occurred while preparing the viewport.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-left text-xs font-mono text-rose-300 overflow-x-auto max-h-48">
              <p className="font-bold text-rose-400">{this.state.error?.toString()}</p>
              {this.state.errorInfo?.componentStack && (
                <pre className="text-[10px] text-slate-400 mt-2 opacity-80 whitespace-pre-wrap">
                  {this.state.errorInfo.componentStack}
                </pre>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                onClick={this.handleReset}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Retry Workstation</span>
              </button>

              <button
                onClick={() => {
                  this.handleReset();
                  if (this.props.onBackToHome) this.props.onBackToHome();
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-semibold text-slate-950 bg-gradient-to-r from-cyan-400 to-teal-300 hover:from-cyan-300 hover:to-teal-200 transition-all cursor-pointer shadow-[0_0_12px_rgba(34,211,238,0.3)]"
              >
                <Home className="w-3.5 h-3.5" />
                <span>Return to Intake Home</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
