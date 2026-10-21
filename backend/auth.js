/**
 * Auth utilities for the admin/agent API.
 * Local dev: JWT_SECRET falls back to a fixed dev string. Production:
 * JWT_SECRET MUST come from a real secret manager — never ship the fallback.
 */
'use strict';
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-insecure-secret-do-not-use-in-production';
const TOKEN_TTL = '12h';
// Agent sessions last 24h on the device (see AGENT_SESSION_TTL_MS in the app), so their token must outlive that
// or usage reporting would silently start failing mid-session.
const AGENT_TOKEN_TTL = '26h';

function signToken(payload){
  return jwt.sign(payload, JWT_SECRET, { expiresIn: payload && payload.type === 'agent' ? AGENT_TOKEN_TTL : TOKEN_TTL });
}
function verifyToken(token){
  try { return jwt.verify(token, JWT_SECRET); }
  catch(e){ return null; }
}
function requireAdmin(req, res, next){
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token && verifyToken(token);
  if(!payload || payload.type !== 'admin'){
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.admin = payload;
  next();
}
function requireAgent(req, res, next){
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token && verifyToken(token);
  if(!payload || payload.type !== 'agent'){
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if(String(payload.companyId) !== String(req.params.companyId)){
    return res.status(403).json({ error: 'Not authorized for this company' });
  }
  req.agent = payload;
  next();
}
function requireSuperadmin(req, res, next){
  requireAdmin(req, res, () => {
    if(req.admin.role !== 'superadmin'){
      return res.status(403).json({ error: 'Superadmin access required' });
    }
    next();
  });
}
function scopeToCompany(req, res, next){
  const requestedCompanyId = Number(req.params.companyId);
  if(req.admin.role === 'superadmin') return next();
  if(req.admin.companyId !== requestedCompanyId){
    return res.status(403).json({ error: 'Not authorized for this company' });
  }
  next();
}
module.exports = { signToken, verifyToken, requireAdmin, requireAgent, requireSuperadmin, scopeToCompany, JWT_SECRET };
