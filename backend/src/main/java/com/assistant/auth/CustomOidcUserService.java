package com.assistant.auth;

import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserRequest;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserService;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import com.assistant.account.LinkedAccountService;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
public class CustomOidcUserService extends OidcUserService {

    private final UserRepository userRepository;
    private final LinkedAccountService linkedAccountService;

    public CustomOidcUserService(UserRepository userRepository, LinkedAccountService linkedAccountService) {
        this.userRepository = userRepository;
        this.linkedAccountService = linkedAccountService;
    }

    @Override
    public OidcUser loadUser(OidcUserRequest userRequest) throws OAuth2AuthenticationException {
        OidcUser oidcUser = super.loadUser(userRequest);
        
        String email = oidcUser.getEmail();
        String name = oidcUser.getFullName();
        String picture = oidcUser.getPicture();
        
        if (email != null) {
            Optional<User> existingUser = userRepository.findByEmail(email);
            if (existingUser.isEmpty()) {
                User newUser = new User();
                newUser.setEmail(email);
                newUser.setName(name != null ? name : email);
                newUser.setPicture(picture);
                userRepository.save(newUser);
                linkedAccountService.ensureLinked(email, name);
            } else {
                User user = existingUser.get();
                boolean update = false;
                if (name != null && !name.equals(user.getName())) {
                    user.setName(name);
                    update = true;
                }
                if (picture != null && !picture.equals(user.getPicture())) {
                    user.setPicture(picture);
                    update = true;
                }
                if (update) {
                    userRepository.save(user);
                }
            }
        }
        
        return oidcUser;
    }
}
