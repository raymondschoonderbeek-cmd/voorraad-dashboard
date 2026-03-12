-- Admin mag bestellingen verwijderen
create policy "Admin can delete lunch orders"
  on lunch_orders for delete
  using (
    exists (
      select 1 from gebruiker_rollen
      where user_id = auth.uid() and rol = 'admin'
    )
  );

-- Admin mag order items verwijderen (nodig voor cascade bij order delete)
create policy "Admin can delete lunch order items"
  on lunch_order_items for delete
  using (
    exists (
      select 1 from gebruiker_rollen
      where user_id = auth.uid() and rol = 'admin'
    )
  );
