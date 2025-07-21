// This function will require login for some pages - refactor to index.js
export function requireLogin(req, res, next) {
  if (!req.session.userId) {
    req.flash('error_msg', 'You must be logged in to access this page.');
    return res.redirect('/login');
  }
  next();
}