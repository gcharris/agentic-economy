//! The staff. Seats at the oak table, not counterparties in a bazaar.
//! They pass the page across the table for free. They do not pay each
//! other. Nobody keeps a score of which seat is good.

pub mod llm;
pub mod statistical;
// The estate Vault route as an `InferenceBackend`. Native only, behind the
// `vault` cargo feature; the module documents itself.
#[cfg(feature = "vault")]
pub mod vault;
