/** Full-page navigations out of the app (Google consent). Replaced in tests. */
export const browser = {
  assign: (url: string): void => {
    window.location.assign(url);
  },
};
