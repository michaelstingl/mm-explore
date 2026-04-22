document.addEventListener('alpine:init', () => {
  Alpine.data('app', () => ({
    bundle: null,
    view: 'main',
    mode: 'reisen',
    init() {
      console.log('M+M Explore: app initialized');
    }
  }));
});
