import React from 'react';

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render errors anywhere below it so a single broken component shows a friendly
 * Arabic recovery screen instead of a blank white page.
 */
export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('AniVerse UI crashed:', error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    this.setState({ error: null });
    window.location.hash = '';
    window.scrollTo({ top: 0 });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        dir="rtl"
        className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-4"
      >
        <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-8 text-center space-y-4 shadow-2xl">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-rose-600/20 border border-rose-500/30 flex items-center justify-center text-2xl">
            ⚠️
          </div>
          <h1 className="text-xl font-black text-white">حدث خطأ غير متوقع</h1>
          <p className="text-sm text-neutral-400 leading-relaxed">
            واجهت الصفحة مشكلة أثناء العرض. يمكنك إعادة تحميل الموقع، ولن تفقد أي شيء محفوظ.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm cursor-pointer"
            >
              إعادة تحميل الموقع
            </button>
            <button
              type="button"
              onClick={this.handleGoHome}
              className="px-5 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-sm border border-neutral-700 cursor-pointer"
            >
              المحاولة مجدداً
            </button>
          </div>
        </div>
      </div>
    );
  }
}
