module deepsignal::access_control {
    const E_OWNER_CAP_REGISTRY_MISMATCH: u64 = 1;
    const E_ADMIN_CAP_REGISTRY_MISMATCH: u64 = 2;
    const E_OWNER_NOT_ACTIVE: u64 = 3;
    const E_ADMIN_NOT_ACTIVE: u64 = 4;
    const E_ADMIN_ALREADY_EXISTS: u64 = 5;
    const E_REVIEWER_ALREADY_EXISTS: u64 = 6;
    const E_ADMIN_NOT_FOUND: u64 = 7;
    const E_REVIEWER_NOT_FOUND: u64 = 8;

    public struct AccessEntry has copy, drop, store {
        address: address,
        cap_id: sui::object::ID,
    }

    public struct Registry has key {
        id: sui::object::UID,
        owner_address: address,
        owner_cap_id: sui::object::ID,
        admins: vector<AccessEntry>,
        reviewers: vector<AccessEntry>,
    }

    public struct OwnerCap has key, store {
        id: sui::object::UID,
        registry_id: sui::object::ID,
    }

    public struct AdminCap has key, store {
        id: sui::object::UID,
        registry_id: sui::object::ID,
    }

    public struct ReviewerCap has key, store {
        id: sui::object::UID,
        registry_id: sui::object::ID,
    }

    fun init(ctx: &mut sui::tx_context::TxContext) {
        let sender = sui::tx_context::sender(ctx);
        let registry_uid = sui::object::new(ctx);
        let registry_id = sui::object::uid_to_inner(&registry_uid);
        let owner_cap_uid = sui::object::new(ctx);
        let owner_cap_id = sui::object::uid_to_inner(&owner_cap_uid);

        let registry = Registry {
            id: registry_uid,
            owner_address: sender,
            owner_cap_id,
            admins: vector[],
            reviewers: vector[],
        };

        sui::transfer::share_object(registry);
        sui::transfer::public_transfer(
            OwnerCap {
                id: owner_cap_uid,
                registry_id,
            },
            sender,
        );
    }

    fun assert_owner_authority(
        owner_cap: &OwnerCap,
        registry: &Registry,
        sender: address,
    ) {
        assert!(
            owner_cap.registry_id == sui::object::id(registry),
            E_OWNER_CAP_REGISTRY_MISMATCH
        );
        assert!(
            registry.owner_address == sender
                && registry.owner_cap_id == sui::object::id(owner_cap),
            E_OWNER_NOT_ACTIVE
        );
    }

    fun assert_admin_authority(
        admin_cap: &AdminCap,
        registry: &Registry,
        sender: address,
    ) {
        assert!(
            admin_cap.registry_id == sui::object::id(registry),
            E_ADMIN_CAP_REGISTRY_MISMATCH
        );
        assert!(
            contains_entry(&registry.admins, sender, sui::object::id(admin_cap)),
            E_ADMIN_NOT_ACTIVE
        );
    }

    fun contains_address(entries: &vector<AccessEntry>, target: address): bool {
        let mut index = 0;
        let length = vector::length(entries);

        while (index < length) {
            let entry = vector::borrow(entries, index);
            if (entry.address == target) {
                return true
            };
            index = index + 1;
        };

        false
    }

    fun contains_entry(
        entries: &vector<AccessEntry>,
        target: address,
        cap_id: sui::object::ID,
    ): bool {
        let mut index = 0;
        let length = vector::length(entries);

        while (index < length) {
            let entry = vector::borrow(entries, index);
            if (entry.address == target && entry.cap_id == cap_id) {
                return true
            };
            index = index + 1;
        };

        false
    }

    fun remove_entry_by_address(
        entries: &mut vector<AccessEntry>,
        target: address,
        not_found_code: u64,
    ) {
        let mut index = 0;
        let length = vector::length(entries);

        while (index < length) {
            let entry = vector::borrow(entries, index);
            if (entry.address == target) {
                vector::swap_remove(entries, index);
                return
            };
            index = index + 1;
        };

        assert!(false, not_found_code);
    }

    public fun issue_admin_cap(
        owner_cap: &OwnerCap,
        registry: &mut Registry,
        recipient: address,
        ctx: &mut sui::tx_context::TxContext,
    ) {
        add_admin(owner_cap, registry, recipient, ctx);
    }

    public fun add_admin(
        owner_cap: &OwnerCap,
        registry: &mut Registry,
        recipient: address,
        ctx: &mut sui::tx_context::TxContext,
    ) {
        assert_owner_authority(owner_cap, registry, sui::tx_context::sender(ctx));
        assert!(!contains_address(&registry.admins, recipient), E_ADMIN_ALREADY_EXISTS);

        let admin_cap_uid = sui::object::new(ctx);
        let admin_cap_id = sui::object::uid_to_inner(&admin_cap_uid);

        vector::push_back(
            &mut registry.admins,
            AccessEntry {
                address: recipient,
                cap_id: admin_cap_id,
            },
        );

        sui::transfer::public_transfer(
            AdminCap {
                id: admin_cap_uid,
                registry_id: sui::object::id(registry),
            },
            recipient,
        );
    }

    public fun issue_admin_cap_to_sender(
        owner_cap: &OwnerCap,
        registry: &mut Registry,
        ctx: &mut sui::tx_context::TxContext,
    ) {
        issue_admin_cap(owner_cap, registry, sui::tx_context::sender(ctx), ctx);
    }

    public fun issue_reviewer_cap(
        admin_cap: &AdminCap,
        registry: &mut Registry,
        recipient: address,
        ctx: &mut sui::tx_context::TxContext,
    ) {
        assert_admin_authority(admin_cap, registry, sui::tx_context::sender(ctx));
        add_reviewer_entry(registry, recipient, ctx);
    }

    public fun add_reviewer_by_owner(
        owner_cap: &OwnerCap,
        registry: &mut Registry,
        recipient: address,
        ctx: &mut sui::tx_context::TxContext,
    ) {
        assert_owner_authority(owner_cap, registry, sui::tx_context::sender(ctx));
        add_reviewer_entry(registry, recipient, ctx);
    }

    fun add_reviewer_entry(
        registry: &mut Registry,
        recipient: address,
        ctx: &mut sui::tx_context::TxContext,
    ) {
        assert!(
            !contains_address(&registry.reviewers, recipient),
            E_REVIEWER_ALREADY_EXISTS
        );

        let reviewer_cap_uid = sui::object::new(ctx);
        let reviewer_cap_id = sui::object::uid_to_inner(&reviewer_cap_uid);

        vector::push_back(
            &mut registry.reviewers,
            AccessEntry {
                address: recipient,
                cap_id: reviewer_cap_id,
            },
        );

        sui::transfer::public_transfer(
            ReviewerCap {
                id: reviewer_cap_uid,
                registry_id: sui::object::id(registry),
            },
            recipient,
        );
    }

    public fun issue_reviewer_cap_to_sender(
        admin_cap: &AdminCap,
        registry: &mut Registry,
        ctx: &mut sui::tx_context::TxContext,
    ) {
        issue_reviewer_cap(admin_cap, registry, sui::tx_context::sender(ctx), ctx);
    }

    public fun remove_admin(
        owner_cap: &OwnerCap,
        registry: &mut Registry,
        admin_address: address,
        ctx: &mut sui::tx_context::TxContext,
    ) {
        assert_owner_authority(owner_cap, registry, sui::tx_context::sender(ctx));
        remove_entry_by_address(&mut registry.admins, admin_address, E_ADMIN_NOT_FOUND);
    }

    public fun remove_reviewer(
        admin_cap: &AdminCap,
        registry: &mut Registry,
        reviewer_address: address,
        ctx: &mut sui::tx_context::TxContext,
    ) {
        assert_admin_authority(admin_cap, registry, sui::tx_context::sender(ctx));
        remove_entry_by_address(&mut registry.reviewers, reviewer_address, E_REVIEWER_NOT_FOUND);
    }

    public fun remove_reviewer_by_owner(
        owner_cap: &OwnerCap,
        registry: &mut Registry,
        reviewer_address: address,
        ctx: &mut sui::tx_context::TxContext,
    ) {
        assert_owner_authority(owner_cap, registry, sui::tx_context::sender(ctx));
        remove_entry_by_address(&mut registry.reviewers, reviewer_address, E_REVIEWER_NOT_FOUND);
    }

    public fun owner_registry_id(cap: &OwnerCap): sui::object::ID {
        cap.registry_id
    }

    public fun admin_registry_id(cap: &AdminCap): sui::object::ID {
        cap.registry_id
    }

    public fun reviewer_registry_id(cap: &ReviewerCap): sui::object::ID {
        cap.registry_id
    }

    public fun stats(registry: &Registry): (u64, u64, u64) {
        (
            1,
            vector::length(&registry.admins),
            vector::length(&registry.reviewers),
        )
    }

    public fun is_owner(
        registry: &Registry,
        wallet: address,
        cap_id: sui::object::ID,
    ): bool {
        registry.owner_address == wallet && registry.owner_cap_id == cap_id
    }

    public fun is_admin(
        registry: &Registry,
        wallet: address,
        cap_id: sui::object::ID,
    ): bool {
        contains_entry(&registry.admins, wallet, cap_id)
    }

    public fun is_reviewer(
        registry: &Registry,
        wallet: address,
        cap_id: sui::object::ID,
    ): bool {
        contains_entry(&registry.reviewers, wallet, cap_id)
    }
}
