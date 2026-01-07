//! Contract bindings generated from ABIs

use ethers::prelude::*;

// Generate type-safe bindings for MockUSDC
abigen!(
    MockUSDCContract,
    "src/blockchain/abi/MockUSDC.json",
    event_derives(serde::Deserialize, serde::Serialize)
);

// Generate type-safe bindings for ConditionalTokens
abigen!(
    ConditionalTokensContract,
    "src/blockchain/abi/ConditionalTokens.json",
    event_derives(serde::Deserialize, serde::Serialize)
);

// Generate type-safe bindings for CTFExchange
abigen!(
    CTFExchangeContract,
    "src/blockchain/abi/CTFExchange.json",
    event_derives(serde::Deserialize, serde::Serialize)
);

// Generate type-safe bindings for UMA Optimistic Oracle V3
abigen!(
    OptimisticOracleV3Contract,
    "src/blockchain/abi/OptimisticOracleV3.json",
    event_derives(serde::Deserialize, serde::Serialize)
);

#[cfg(test)]
mod tests {
    use super::*;
    use ethers::types::Address;

    #[test]
    fn test_contract_addresses_parse() {
        let usdc: Address = "0x43954707B63e4bbb777c81771A5853031cFB901d"
            .parse()
            .unwrap();
        let ctf: Address = "0xd7a05df3CD0f963DA444c7FB251Ea7ebb541E2F2"
            .parse()
            .unwrap();
        let exchange: Address = "0x15b0d7db6137F6cAaB4c4E8CA8318Cb46e46C19B"
            .parse()
            .unwrap();

        assert_eq!(
            format!("{:?}", usdc),
            "0x43954707b63e4bbb777c81771a5853031cfb901d"
        );
        assert_eq!(
            format!("{:?}", ctf),
            "0xd7a05df3cd0f963da444c7fb251ea7ebb541e2f2"
        );
        assert_eq!(
            format!("{:?}", exchange),
            "0x15b0d7db6137f6caab4c4e8ca8318cb46e46c19b"
        );
    }
}
