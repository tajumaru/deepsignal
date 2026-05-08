module deepsignal::access_control {
    const E_OWNER_CAP_REGISTRY_MISMATCH: u64 = 1;
    const E_ADMIN_CAP_REGISTRY_MISMATCH: u64 = 2;

    public struct Registry has key {
        id: sui::object::UID,
        owner_count: u64,
        admin_count: u64,
        reviewer_count: u64,
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
        let registry = Registry {
            id: sui::object::new(ctx),
            owner_count: 1,
            admin_count: 0,
            reviewer_count: 0,
        };

        let registry_id = sui::object::id(&registry);
        sui::transfer::share_object(registry);

        sui::transfer::public_transfer(
            OwnerCap {
                id: sui::object::new(ctx),
                registry_id,
            },
            sui::tx_context::sender(ctx),
        );
    }

    public fun issue_admin_cap(
        owner_cap: &OwnerCap,
        registry: &mut Registry,
        recipient: address,
        ctx: &mut sui::tx_context::TxContext,
    ) {
        assert!(
            owner_cap.registry_id == sui::object::id(registry),
            E_OWNER_CAP_REGISTRY_MISMATCH
        );

        registry.admin_count = registry.admin_count + 1;

        sui::transfer::public_transfer(
            AdminCap {
                id: sui::object::new(ctx),
                registry_id: sui::object::id(registry),
            },
            recipient,
        );
    }

    public fun add_admin(
        owner_cap: &OwnerCap,
        registry: &mut Registry,
        recipient: address,
        ctx: &mut sui::tx_context::TxContext,
    ) {
        assert!(
            owner_cap.registry_id == sui::object::id(registry),
            E_OWNER_CAP_REGISTRY_MISMATCH
        );

        registry.admin_count = registry.admin_count + 1;

        sui::transfer::public_transfer(
            AdminCap {
                id: sui::object::new(ctx),
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
        assert!(
            admin_cap.registry_id == sui::object::id(registry),
            E_ADMIN_CAP_REGISTRY_MISMATCH
        );

        registry.reviewer_count = registry.reviewer_count + 1;

        sui::transfer::public_transfer(
            ReviewerCap {
                id: sui::object::new(ctx),
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
        (registry.owner_count, registry.admin_count, registry.reviewer_count)
    }
}
