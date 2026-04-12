package com.assistant.auth;

import com.assistant.util.EncryptedStringConverter;
import jakarta.persistence.*;

import java.time.Instant;

@Entity
@Table(name = "oauth_tokens")
public class OAuthToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Convert(converter = EncryptedStringConverter.class)
    @Column(nullable = false, length = 2048)
    private String accessToken;

    @Convert(converter = EncryptedStringConverter.class)
    @Column(length = 2048)
    private String refreshToken;

    @Column(nullable = false)
    private Instant expiresAt;

    @Column(length = 1000)
    private String scope;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }

    public String getAccessToken() { return accessToken; }
    public void setAccessToken(String accessToken) { this.accessToken = accessToken; }

    public String getRefreshToken() { return refreshToken; }
    public void setRefreshToken(String refreshToken) { this.refreshToken = refreshToken; }

    public Instant getExpiresAt() { return expiresAt; }
    public void setExpiresAt(Instant expiresAt) { this.expiresAt = expiresAt; }

    public String getScope() { return scope; }
    public void setScope(String scope) { this.scope = scope; }

    public OAuthToken() {}

    public OAuthToken(Long id, User user, String accessToken, String refreshToken, Instant expiresAt, String scope) {
        this.id = id;
        this.user = user;
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
        this.expiresAt = expiresAt;
        this.scope = scope;
    }
}
